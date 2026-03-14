#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root."
  exit 1
fi

if ! command -v apt >/dev/null 2>&1; then
  echo "This bootstrap script currently supports Debian/Ubuntu-style systems with apt."
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${REPO_DIR}/packages/backend"
FRONTEND_DIR="${REPO_DIR}/packages/frontend"
BACKEND_ENV_FILE="${BACKEND_DIR}/.env"
APP_MODE="${APP_MODE:-development}"

LOCAL_AUTH_ENABLED_VALUE="${LOCAL_AUTH_ENABLED:-}"
if [[ -z "${LOCAL_AUTH_ENABLED_VALUE}" ]]; then
  if [[ "${APP_MODE}" == "development" ]]; then
    LOCAL_AUTH_ENABLED_VALUE="true"
  else
    LOCAL_AUTH_ENABLED_VALUE="false"
  fi
fi
LOCAL_AUTH_EMAIL_VALUE="${LOCAL_AUTH_EMAIL:-master@serialhub.local}"
LOCAL_AUTH_PASSWORD_VALUE="${LOCAL_AUTH_PASSWORD:-master123456}"
LOCAL_AUTH_NAME_VALUE="${LOCAL_AUTH_NAME:-Local Master}"

upsert_env() {
  local key="$1"
  local value="$2"

  if [[ ! -f "${BACKEND_ENV_FILE}" ]]; then
    touch "${BACKEND_ENV_FILE}"
  fi

  if grep -q "^${key}=" "${BACKEND_ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${BACKEND_ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${BACKEND_ENV_FILE}"
  fi
}

better_sqlite3_binding_exists() {
  local release_binding="${BACKEND_DIR}/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
  local debug_binding="${BACKEND_DIR}/node_modules/better-sqlite3/build/Debug/better_sqlite3.node"

  [[ -f "${release_binding}" || -f "${debug_binding}" ]]
}

detect_default_public_host() {
  local detected_host=""

  if command -v curl >/dev/null 2>&1; then
    detected_host="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  fi

  if [[ -z "${detected_host}" ]]; then
    detected_host="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi

  if [[ -z "${detected_host}" ]]; then
    detected_host="127.0.0.1"
  fi

  printf '%s' "${detected_host}"
}

normalize_origin() {
  local raw_value="$1"

  if [[ "${raw_value}" =~ ^https?:// ]]; then
    printf '%s' "${raw_value}"
  else
    printf 'http://%s' "${raw_value}"
  fi
}

derive_backend_origin() {
  local frontend_origin="$1"

  python3 - "$frontend_origin" <<'PY'
import sys
from urllib.parse import urlparse

frontend_origin = sys.argv[1]
parsed = urlparse(frontend_origin)
scheme = parsed.scheme or "http"
hostname = parsed.hostname or "127.0.0.1"
print(f"{scheme}://{hostname}:3001")
PY
}

echo "==> Installing required system packages"
apt update
apt install -y ca-certificates gnupg git python3 build-essential gcc g++ make curl

if [[ -n "${SESSION_SECRET:-}" ]]; then
  SESSION_SECRET_VALUE="${SESSION_SECRET}"
else
  SESSION_SECRET_VALUE="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
)"
fi

PUBLIC_HOST="${PUBLIC_HOST:-}"
if [[ -z "${PUBLIC_HOST}" ]]; then
  DETECTED_PUBLIC_HOST="$(detect_default_public_host)"
  DETECTED_FRONTEND_ORIGIN="http://${DETECTED_PUBLIC_HOST}:3000"

  if [[ -t 0 ]]; then
    read -r -p "Public browser origin (include port if users will access :3000) [${DETECTED_FRONTEND_ORIGIN}]: " PUBLIC_HOST_INPUT
    PUBLIC_HOST="${PUBLIC_HOST_INPUT:-${DETECTED_FRONTEND_ORIGIN}}"
  else
    PUBLIC_HOST="${DETECTED_FRONTEND_ORIGIN}"
  fi
fi

PUBLIC_BASE_URL="$(normalize_origin "${PUBLIC_HOST}")"

FRONTEND_PUBLIC_URL="${FRONTEND_URL:-${PUBLIC_BASE_URL}}"
BACKEND_PUBLIC_URL="${BACKEND_URL:-$(derive_backend_origin "${FRONTEND_PUBLIC_URL}")}"
INTERNAL_BACKEND_URL="${INTERNAL_BACKEND_URL:-http://127.0.0.1:3001}"

NODE_MAJOR=""
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
fi

if [[ -z "${NODE_MAJOR}" || ( "${NODE_MAJOR}" != "20" && "${NODE_MAJOR}" != "22" ) ]]; then
  echo "==> Installing Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
else
  echo "==> Using existing supported Node.js $(node -v)"
fi

echo "==> Installing PM2"
npm install -g pm2

echo "==> Preparing backend directories"
mkdir -p "${BACKEND_DIR}/data" "${BACKEND_DIR}/logs"

echo "==> Writing backend environment file"
upsert_env "NODE_ENV" "${APP_MODE}"
upsert_env "PORT" "3001"
upsert_env "DATABASE_PATH" "./data/serialhub.db"
upsert_env "SESSION_SECRET" "${SESSION_SECRET_VALUE}"
upsert_env "FRONTEND_URL" "${FRONTEND_PUBLIC_URL}"
upsert_env "BACKEND_URL" "${BACKEND_PUBLIC_URL}"
upsert_env "TRUST_PROXY" "false"
upsert_env "LOCAL_AUTH_ENABLED" "${LOCAL_AUTH_ENABLED_VALUE}"
upsert_env "LOCAL_AUTH_EMAIL" "${LOCAL_AUTH_EMAIL_VALUE}"
upsert_env "LOCAL_AUTH_PASSWORD" "${LOCAL_AUTH_PASSWORD_VALUE}"
upsert_env "LOCAL_AUTH_NAME" "${LOCAL_AUTH_NAME_VALUE}"

if [[ -n "${GOOGLE_CLIENT_ID:-}" ]]; then
  upsert_env "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID}"
fi
if [[ -n "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  upsert_env "GOOGLE_CLIENT_SECRET" "${GOOGLE_CLIENT_SECRET}"
fi
if [[ -n "${GOOGLE_CALLBACK_URL:-}" ]]; then
  upsert_env "GOOGLE_CALLBACK_URL" "${GOOGLE_CALLBACK_URL}"
fi

echo "==> Installing project dependencies"
cd "${REPO_DIR}"
npm install
(cd "${BACKEND_DIR}" && npm install)
(cd "${FRONTEND_DIR}" && npm install)

if better_sqlite3_binding_exists; then
  echo "==> Reusing existing better-sqlite3 native bindings"
else
  echo "==> Rebuilding better-sqlite3 native bindings"
  (cd "${BACKEND_DIR}" && npm rebuild better-sqlite3 --build-from-source)
fi

echo "==> Building backend"
(cd "${BACKEND_DIR}" && npm run build)

echo "==> Building frontend standalone output"
(cd "${FRONTEND_DIR}" && BACKEND_URL="${INTERNAL_BACKEND_URL}" npm run build)

FRONTEND_STANDALONE_DIR=""
if [[ -f "${FRONTEND_DIR}/.next/standalone/server.js" ]]; then
  FRONTEND_STANDALONE_DIR="${FRONTEND_DIR}/.next/standalone"
elif [[ -f "${FRONTEND_DIR}/.next/standalone/packages/frontend/server.js" ]]; then
  FRONTEND_STANDALONE_DIR="${FRONTEND_DIR}/.next/standalone/packages/frontend"
else
  echo "Frontend standalone server.js was not produced by the build."
  exit 1
fi

echo "==> Staging standalone frontend assets in ${FRONTEND_STANDALONE_DIR}"
mkdir -p "${FRONTEND_STANDALONE_DIR}/.next"
rm -rf "${FRONTEND_STANDALONE_DIR}/.next/static"
cp -R "${FRONTEND_DIR}/.next/static" "${FRONTEND_STANDALONE_DIR}/.next/static"

if [[ -d "${FRONTEND_DIR}/public" ]]; then
  rm -rf "${FRONTEND_STANDALONE_DIR}/public"
  cp -R "${FRONTEND_DIR}/public" "${FRONTEND_STANDALONE_DIR}/public"
fi

echo "==> Starting services with PM2"
cd "${REPO_DIR}"
pm2 delete serialhub-backend >/dev/null 2>&1 || true
pm2 delete serialhub-frontend >/dev/null 2>&1 || true
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
fi

cat <<EOF

SerialHub bootstrap complete.

Frontend URL: ${FRONTEND_PUBLIC_URL}
Backend URL:  ${BACKEND_PUBLIC_URL}
Internal backend target for frontend build: ${INTERNAL_BACKEND_URL}
Mode:         ${APP_MODE}

PM2 commands:
  pm2 status
  pm2 logs
  pm2 restart serialhub-backend
  pm2 restart serialhub-frontend

If you want Google OAuth, add these to ${BACKEND_ENV_FILE} and restart PM2:
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  GOOGLE_CALLBACK_URL=${BACKEND_PUBLIC_URL}/api/auth/google/callback

Local auth:
  enabled=${LOCAL_AUTH_ENABLED_VALUE}
  email=${LOCAL_AUTH_EMAIL_VALUE}
  password=${LOCAL_AUTH_PASSWORD_VALUE}

EOF
