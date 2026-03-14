# Getting Started

## Prerequisites

- Node.js 20 LTS recommended
- Node.js 22 LTS supported
- npm 9+
- Docker Desktop or Docker Engine with Compose if you want the container stack
- A reachable `raw-tcp` or `rfc2217` endpoint if you want live serial testing
- Google OAuth credentials only if you want Google login outside development-only local auth

Avoid experimental Node versions such as Node 25. Native modules such as `better-sqlite3` may not have compatible prebuilt binaries there.

## Local Setup

1. If you are on a minimal Debian-style environment, install required build tools before `npm install`:

```bash
apt update
apt install -y python3 build-essential gcc g++ make curl
```

These packages are required because native modules such as `better-sqlite3` compile through `node-gyp`.

2. Install dependencies:

```bash
npm install
```

3. Create `packages/backend/.env`.

4. Start the monorepo:

```bash
npm run dev
```

This starts:

- frontend on `http://localhost:3000`
- backend on `http://localhost:3001`

## Minimal Install Sequence

```bash
git clone https://github.com/ArashDoDo2/SerialHub.git
cd SerialHub
npm install
npm run build
npm start
```

## Minimum Backend Environment

```env
PORT=3001
DATABASE_PATH=./data/serialhub.db
SESSION_SECRET=change-me
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
```

## Optional Google OAuth

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
```

## Development-Only Local Auth

```env
LOCAL_AUTH_ENABLED=true
LOCAL_AUTH_EMAIL=master@serialhub.local
LOCAL_AUTH_PASSWORD=master123456
LOCAL_AUTH_NAME=Local Master
```

`LOCAL_AUTH_ENABLED` is allowed only when `NODE_ENV=development`. Backend startup fails if it is enabled in production.

## Useful Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run backend and frontend together |
| `npm run build` | Build backend and frontend |
| `cd packages/backend && npm test` | Run backend build + integration checks |
| `cd docker && docker compose up --build` | Start the compose stack |

## First Checks

1. Open `http://localhost:3000`
2. Create or inspect a node in `/nodes`
3. Use `/nodes` or `/node/:id` to confirm live status checks
4. Open `/terminal`
5. Use `/terminal?debug=1` for protocol trace, transport capabilities, and diagnostics

## Notes

- Nodes support `connectionType = raw-tcp | rfc2217`.
- The dashboard `Active nodes` metric is based on live connection probes.
- Terminal sessions are single-controller and stale sessions are cleaned up on backend startup.
- On minimal container environments such as Debian slim or MikroTik RouterOS containers, the build dependencies above are mandatory.
- If Node.js is upgraded after install, rebuild native modules with `npm rebuild` or reinstall dependencies with `rm -rf node_modules && npm install`.
