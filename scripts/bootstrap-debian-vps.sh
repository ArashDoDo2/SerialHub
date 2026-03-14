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

PUBLIC_HOST="${PUBLIC_HOST:-}"
if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="127.0.0.1"
fi

if [[ "${PUBLIC_HOST}" =~ ^https?:// ]]; then
  PUBLIC_BASE_URL="${PUBLIC_HOST}"
else
  PUBLIC_BASE_URL="http://${PUBLIC_HOST}"
fi

FRONTEND_PUBLIC_URL="${FRONTEND_URL:-${PUBLIC_BASE_URL}:3000}"
BACKEND_PUBLIC_URL="${BACKEND_URL:-${PUBLIC_BASE_URL}:3001}"
SESSION_SECRET_VALUE="${SESSION_SECRET:-$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
)}"

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

echo "==> Installing required system packages"
apt update
apt install -y ca-certificates gnupg git python3 build-essential gcc g++ make curl

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
upsert_env "NODE_ENV" "production"
upsert_env "PORT" "3001"
upsert_env "DATABASE_PATH" "./data/serialhub.db"
upsert_env "SESSION_SECRET" "${SESSION_SECRET_VALUE}"
upsert_env "FRONTEND_URL" "${FRONTEND_PUBLIC_URL}"
upsert_env "BACKEND_URL" "${BACKEND_PUBLIC_URL}"
upsert_env "TRUST_PROXY" "false"

echo "==> Installing project dependencies"
cd "${REPO_DIR}"
npm install
(cd "${BACKEND_DIR}" && npm install)
(cd "${FRONTEND_DIR}" && npm install)

echo "==> Building backend"
(cd "${BACKEND_DIR}" && npm run build)

echo "==> Building frontend standalone output"
(cd "${FRONTEND_DIR}" && BACKEND_URL="${BACKEND_PUBLIC_URL}" npm run build)

echo "==> Staging standalone frontend assets"
mkdir -p "${FRONTEND_DIR}/.next/standalone/.next"
rm -rf "${FRONTEND_DIR}/.next/standalone/.next/static"
cp -R "${FRONTEND_DIR}/.next/static" "${FRONTEND_DIR}/.next/standalone/.next/static"

if [[ -d "${FRONTEND_DIR}/public" ]]; then
  rm -rf "${FRONTEND_DIR}/.next/standalone/public"
  cp -R "${FRONTEND_DIR}/public" "${FRONTEND_DIR}/.next/standalone/public"
fi

echo "==> Starting services with PM2"
cd "${REPO_DIR}"
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
fi

cat <<EOF

SerialHub bootstrap complete.

Frontend URL: ${FRONTEND_PUBLIC_URL}
Backend URL:  ${BACKEND_PUBLIC_URL}

PM2 commands:
  pm2 status
  pm2 logs
  pm2 restart serialhub-backend
  pm2 restart serialhub-frontend

If you want Google OAuth, add these to ${BACKEND_ENV_FILE} and restart PM2:
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  GOOGLE_CALLBACK_URL=${BACKEND_PUBLIC_URL}/api/auth/google/callback

EOF
