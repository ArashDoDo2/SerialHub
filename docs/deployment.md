# Deployment

SerialHub ships with a compose-based deployment under `docker/docker-compose.yml`.

## Services

- `backend`
  - Express + Socket.IO
  - internal port `3001`
  - SQLite data mounted at `/app/data`
  - logs mounted at `/app/logs`
- `frontend`
  - Next.js production server
  - internal port `3000`
- `nginx`
  - public entrypoint on port `80`
  - proxies frontend traffic and `/api` calls

## Compose Startup

From the repository root:

```bash
cd docker
docker compose up --build
```

Default public URL:

- `http://localhost`

## Quick Debian VPS Setup Without Docker

For a direct VPS install with PM2 and the standalone frontend build:

```bash
bash scripts/bootstrap-debian-vps.sh
```

The bootstrap script is designed for Debian and Ubuntu style systems and will:

- install required build tools for native Node modules
- install Node.js 20 LTS if the current Node version is missing or unsupported
- install PM2
- install package dependencies for the root, backend, and frontend
- build the backend
- build and stage the standalone frontend runtime
- create `packages/backend/.env`
- start `serialhub-backend` and `serialhub-frontend` with PM2

By default it bootstraps the backend in `development` mode so local auth works immediately for first-time testing.

During interactive runs, the script prompts for the public IP or hostname and offers the detected server address as the default.

The script builds the standalone frontend against `http://127.0.0.1:3001` by default so frontend `/api/*` rewrites continue to work even when the VPS public IP is not reachable from inside the local container or namespace.

To force a specific public hostname or domain:

```bash
PUBLIC_HOST=your.domain.example bash scripts/bootstrap-debian-vps.sh
```

To override the internal backend target used during the frontend build:

```bash
INTERNAL_BACKEND_URL=http://127.0.0.1:3001 bash scripts/bootstrap-debian-vps.sh
```

To switch the bootstrap to a production-oriented backend configuration:

```bash
APP_MODE=production LOCAL_AUTH_ENABLED=false bash scripts/bootstrap-debian-vps.sh
```

After bootstrap:

```bash
pm2 status
pm2 logs
```

## Important Environment Variables

Compose currently sets:

- `NODE_ENV=production`
- `FRONTEND_URL=http://localhost`
- `BACKEND_URL=http://backend:3001`
- `TRUST_PROXY=true`
- `DATABASE_PATH=/app/data/serialhub.db`
- `SESSION_SECRET` from the compose environment

If you use Google OAuth in deployment, also provide:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

## Persistence

Named volumes are used for:

- `serialhub-data`
- `serialhub-logs`

This keeps SQLite data and backend logs across container restarts.

## Health Checks

The compose stack includes health checks for:

- backend readiness on `/api/health/ready`
- frontend HTTP availability
- nginx HTTP availability

## Production Notes

- local auth must stay disabled in production
- set a strong `SESSION_SECRET`
- make sure OAuth callback URLs match the deployed origin
- terminate TLS at nginx or an upstream load balancer

## Scaling Notes

The current default deployment is optimized for one SQLite-backed instance. Horizontal scaling would require at least:

- a shared session store
- a database suitable for multi-instance writes
- coordination for live terminal control semantics
