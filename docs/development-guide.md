# Development Guide

This document outlines the current local workflow for building and testing SerialHub.

## Workspace Structure

```text
/packages/backend    Backend TypeScript server
/packages/frontend   Next.js frontend
/docker              Compose and nginx files
/docs                Project documentation
```

Use `npm install` at the repository root to install all dependencies.

## Running Locally

- backend: `npm run dev:backend`
- frontend: `npm run dev:frontend`
- both together: `npm run dev`

Backend dev uses `tsx watch src/server.ts`. Frontend dev uses `next dev`.

## Building

```bash
npm run build
```

Or build packages individually:

```bash
npm run build:backend
npm run build:frontend
```

## Testing

Current automated coverage is backend-focused.

- `cd packages/backend && npm test`

That command builds the backend and runs the project test harness in `packages/backend/tests/run-tests.js`.

## Environment

Important backend config lives in `packages/backend/.env`.

Examples:

- `SESSION_SECRET`
- `DATABASE_PATH`
- `FRONTEND_URL`
- `BACKEND_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- development-only local auth variables

## Working on New Features

1. Add or update migrations under `packages/backend/src/migrations`
2. Update repositories and services
3. Expose the API through route handlers with validation
4. Add backend tests in `packages/backend/tests`
5. Update frontend pages and components
6. Update affected docs in `docs/`

## Troubleshooting

- port conflicts: make sure nothing else is binding `3000` or `3001`
- database issues: remove the local SQLite file only if you intentionally want a clean dev database
- OAuth issues: verify callback URLs and browser origin settings
- local auth: only works in `NODE_ENV=development`
