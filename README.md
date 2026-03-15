# SerialHub

SerialHub is a multi-user serial operations platform for managing remote `raw-tcp` and `rfc2217` endpoints from the browser.

It currently includes:

- Node.js + Express backend
- Next.js frontend
- browser terminal with Socket.IO + xterm.js
- `raw-tcp` and `rfc2217` transport support
- script execution with run history and log download
- SQLite persistence and SQLite-backed sessions
- Google OAuth plus development-only local auth
- owner-scoped multi-tenant access control with admin override
- AI observer, copilot, and automation subsystems

## Monorepo Layout

```text
packages/backend    Express API, Socket.IO, transports, SQLite
packages/frontend   Next.js App Router frontend
docker              Compose and nginx deployment files
docs                Product, architecture, and audit documentation
```

## Local Development

1. Install required system packages first if you are on a minimal Linux environment such as Debian slim, a RouterOS container, or another stripped-down container image:

```bash
apt update
apt install -y python3 build-essential gcc g++ make curl
```

These packages are required because native modules such as `better-sqlite3` compile through `node-gyp` during `npm install`.

2. Use a supported Node.js LTS release:

- Node.js 20 LTS recommended
- Node.js 22 LTS supported

Avoid experimental Node releases such as Node 25 because native dependencies may not provide compatible prebuilt binaries.

3. Install dependencies:

```bash
npm install
```

4. Create `packages/backend/.env` with at least:

```env
PORT=3001
DATABASE_PATH=./data/serialhub.db
SESSION_SECRET=change-me
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
```

5. Start both apps:

```bash
npm run dev
```

Development URLs:

- frontend: `http://localhost:3000`
- backend: `http://localhost:3001`

## Minimal Install Flow

```bash
git clone https://github.com/ArashDoDo2/SerialHub.git
cd SerialHub
npm install
npm run build
npm start
```

If Node.js is upgraded after dependencies were installed, rebuild native modules:

```bash
npm rebuild
```

Or reinstall dependencies cleanly:

```bash
rm -rf node_modules
npm install
```

## Auth Modes

SerialHub supports:

- Google OAuth for normal sign-in
- development-only local auth via `POST /api/auth/login`

Example local-dev auth settings:

```env
LOCAL_AUTH_ENABLED=true
LOCAL_AUTH_EMAIL=master@serialhub.local
LOCAL_AUTH_PASSWORD=master123456
LOCAL_AUTH_NAME=Local Master
```

`LOCAL_AUTH_ENABLED` is rejected at startup outside `NODE_ENV=development`.

## Useful Commands

```bash
npm run dev
npm run build
cd packages/backend && npm test
cd docker && docker compose up --build
```

## Debian VPS Bootstrap

For a quick non-Docker deployment on a fresh Debian or Ubuntu VPS, the repo now includes:

```bash
bash scripts/bootstrap-debian-vps.sh
```

The script:

- installs native build prerequisites
- installs Node.js 20 LTS if needed
- installs PM2
- installs backend and frontend package dependencies
- builds the backend
- builds and stages the standalone frontend
- creates a backend `.env`
- starts both services in the background with PM2

If `better-sqlite3` is already compiled on the VPS, the bootstrap script reuses the existing native binding instead of rebuilding it on every run.

It defaults to `APP_MODE=development`, which is useful for first-time VPS bring-up and enables local auth by default.

During interactive runs, the script asks for the full browser origin that users will open, including scheme and port when needed. For example:

- `http://159.100.17.169:3000` for direct access to the standalone frontend port
- `http://159.100.17.169` when the app is exposed on port `80` through a reverse proxy or port mapping

For standalone frontend builds, the script uses an internal backend target of `http://127.0.0.1:3001` by default so `/api/*` proxying works reliably inside the VPS even when the public IP is not reachable from the local container or namespace.

In the PM2 standalone deployment, the public frontend port acts as the single browser-facing entrypoint. It proxies page traffic, `/api/*`, and `/socket.io/*` to the appropriate internal services, so remote clients do not need direct access to port `3001`.

You can override the detected public host when bootstrapping:

```bash
PUBLIC_HOST=your.domain.example bash scripts/bootstrap-debian-vps.sh
```

You can also override the backend target used during the frontend build:

```bash
INTERNAL_BACKEND_URL=http://127.0.0.1:3001 bash scripts/bootstrap-debian-vps.sh
```

For a production-oriented bootstrap:

```bash
APP_MODE=production LOCAL_AUTH_ENABLED=false bash scripts/bootstrap-debian-vps.sh
```

## Current Platform Notes

- Nodes are owner-scoped by `ownerUserId`; admins can access all resources.
- Terminal control is single-controller per node.
- Stale terminal sessions are reconciled on backend startup after crashes.
- Dashboard "active" status is based on live node probes, not only the saved `isActive` flag.

## Documentation

Start with:

1. [docs/getting-started.md](docs/getting-started.md)
2. [docs/architecture.md](docs/architecture.md)
3. [docs/authentication.md](docs/authentication.md)
4. [docs/api-reference.md](docs/api-reference.md)
5. [docs/serial-nodes.md](docs/serial-nodes.md)
6. [docs/transport-architecture.md](docs/transport-architecture.md)
7. [docs/multi-tenant-model.md](docs/multi-tenant-model.md)
