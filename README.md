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

1. Install dependencies:

```bash
npm install
```

2. Create `packages/backend/.env` with at least:

```env
PORT=3001
DATABASE_PATH=./data/serialhub.db
SESSION_SECRET=change-me
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
```

3. Start both apps:

```bash
npm run dev
```

Development URLs:

- frontend: `http://localhost:3000`
- backend: `http://localhost:3001`

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
