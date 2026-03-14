#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRIMARY_SERVER="${REPO_DIR}/packages/frontend/.next/standalone/server.js"
MONOREPO_SERVER="${REPO_DIR}/packages/frontend/.next/standalone/packages/frontend/server.js"

if [[ -f "${PRIMARY_SERVER}" ]]; then
  cd "$(dirname "${PRIMARY_SERVER}")"
  exec node ./server.js
fi

if [[ -f "${MONOREPO_SERVER}" ]]; then
  cd "$(dirname "${MONOREPO_SERVER}")"
  exec node ./server.js
fi

echo "No standalone frontend server.js was found. Build the frontend first."
exit 1
