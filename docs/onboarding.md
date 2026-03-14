# Developer Onboarding Guide

This guide helps a new engineer get productive in the current SerialHub codebase without relying on older scaffold assumptions.

## 1. Start the App

1. Install dependencies:

```bash
npm install
```

2. Create `packages/backend/.env`

3. Start both apps:

```bash
npm run dev
```

4. Open:

- frontend: `http://localhost:3000`
- backend: `http://localhost:3001`

## 2. Understand the Runtime Model

SerialHub is not RFC2217-only anymore.

Each node has:

- `connectionType = raw-tcp | rfc2217`
- owner-based access control
- live terminal and optional script activity

Start here:

- `packages/backend/src/app.ts`
- `packages/backend/src/services/SerialConnectionManager.ts`
- `packages/frontend/src/app/terminal/page.tsx`

## 3. How Terminal Sessions Work

1. The frontend calls `POST /api/terminal/start`
2. Backend acquires a single-controller terminal session
3. The frontend subscribes over Socket.IO with:
   - `terminal:subscribe`
   - `terminal:heartbeat`
   - `terminal:input`
   - `terminal:unsubscribe`
4. Inbound serial data is forwarded as `terminal:data`

Important current details:

- terminal sessions are persisted
- heartbeats keep controller locks alive
- stale active sessions are cleaned up on backend startup

## 4. How Scripts Execute

1. Scripts are stored as JSON command arrays
2. `POST /api/scripts/:id/execute` starts a run on a node
3. The backend enforces owner checks on both script and node
4. Output is written to run log files and persisted in `scriptRuns`

Good files to read:

- `packages/backend/src/services/ScriptService.ts`
- `packages/backend/src/routes/scripts.ts`
- `packages/backend/src/routes/runs.ts`

## 5. How Auth Works

SerialHub supports:

- Google OAuth
- development-only local auth

Read:

- `packages/backend/src/routes/auth.ts`
- `packages/backend/src/config/env.ts`
- `packages/backend/src/middleware/auth.ts`

Important: `LOCAL_AUTH_ENABLED` is blocked outside development.

## 6. How Multi-Tenancy Works

Resources are owner-scoped.

Normal users only see their own:

- nodes
- scripts
- runs
- AI resources

Admins can access all resources.

Read:

- [multi-tenant-model.md](./multi-tenant-model.md)
- `packages/backend/src/middleware/auth.ts`

## 7. How AI Features Fit In

There are three AI subsystems:

- observer
- copilot
- automation

Read:

- `packages/backend/src/services/AIObserverService.ts`
- `packages/backend/src/services/AICopilotService.ts`
- `packages/backend/src/services/AIAutomationService.ts`
- `packages/backend/src/services/ToolRegistry.ts`

## 8. Recommended Reading Order

1. [architecture.md](./architecture.md)
2. [authentication.md](./authentication.md)
3. [api-reference.md](./api-reference.md)
4. [serial-nodes.md](./serial-nodes.md)
5. [connection-engine.md](./connection-engine.md)
6. [transport-architecture.md](./transport-architecture.md)
7. [multi-tenant-model.md](./multi-tenant-model.md)

## 9. Practical First Tasks

- add a node in `/nodes`
- verify live reachability with `/api/nodes/:id/test`
- open `/terminal?debug=1`
- inspect transport capabilities and protocol trace
- create a script and execute it on a node you own
