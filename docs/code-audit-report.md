# SerialHub Code Audit Report

Date: 2026-03-13

Scope: Current repository state including backend, frontend, WebSocket terminal, script engine, SQLite persistence, Google OAuth, and container deployment.

## Architecture Assessment

### Issue: Transport and domain concerns are still tightly coupled
Risk level: High
Description: The serial engine imports Socket.IO directly and emits client-facing events from inside the connection manager, while the application bootstrap also contains terminal session orchestration and socket authorization logic in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts#L71) and [SerialConnectionManager.ts](/c:/dev/SerialHub/packages/backend/src/services/SerialConnectionManager.ts#L5). This makes the serial layer difficult to test in isolation and keeps real business rules spread across app bootstrap, terminal session service, and serial manager.
Recommended fix: Introduce a dedicated terminal orchestration layer that owns control sessions, serial lifecycle, and event fan-out. Keep Socket.IO as a transport adapter and keep `SerialConnectionManager` unaware of web concerns.

### Issue: `app.ts` remains a coordination-heavy file
Risk level: Medium
Description: Session setup, OAuth bootstrap, HTTP middleware, WebSocket auth, terminal session enforcement, and graceful shutdown all live in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts#L20). That is too much operational responsibility for one file and raises regression risk whenever auth or terminal behavior changes.
Recommended fix: Split application composition into modules for HTTP setup, WebSocket setup, session/auth bootstrap, and shutdown hooks.

### Issue: Test engine is still architectural debt, not a real subsystem
Risk level: Medium
Description: The schema includes `testCases` and `testRuns`, but there is still no production implementation or endpoint surface using them. The codebase therefore carries planned-domain complexity without runtime ownership.
Recommended fix: Either remove dormant schema and docs from the production story, or implement a minimal, tested test-engine service before expanding surrounding abstractions.

### Issue: Route and service boundaries are improved but still inconsistent
Risk level: Medium
Description: Routes now enforce more access control, but they still contain ownership checks and response shaping logic, while services mix orchestration and DTO shaping, for example in [scripts.ts](/c:/dev/SerialHub/packages/backend/src/routes/scripts.ts) and [ScriptService.ts](/c:/dev/SerialHub/packages/backend/src/services/ScriptService.ts#L30). The layering is workable but not clean enough for long-term maintainability.
Recommended fix: Move ownership and policy checks into application services, and expose typed service results that routes only translate to HTTP.

## Security Assessment

### Issue: CSRF protection is still missing on session-backed state-changing routes
Risk level: High
Description: The app uses cookie-backed sessions and `sameSite: 'lax'` in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts#L45), but there is no CSRF token or explicit Origin/Referer validation on `POST` endpoints such as logout, terminal start/stop, node mutation, and script execution. Cookie sessions alone do not eliminate CSRF risk for same-site navigation patterns.
Recommended fix: Add CSRF tokens or strict origin validation middleware for all state-changing routes.

### Issue: Logout does not destroy the backing session record
Risk level: Medium
Description: `POST /api/auth/logout` calls `req.logout()` but does not destroy the server-side session in [auth.ts](/c:/dev/SerialHub/packages/backend/src/routes/auth.ts#L39). With the SQLite session store, the session row can remain valid until expiry.
Recommended fix: Call `req.session.destroy()` and clear the session cookie explicitly during logout.

### Issue: Session store retention is unbounded
Risk level: Medium
Description: `SQLiteSessionStore` supports pruning expired sessions, but `pruneExpired()` is never scheduled or invoked in [SQLiteSessionStore.ts](/c:/dev/SerialHub/packages/backend/src/config/SQLiteSessionStore.ts#L75). Over time the session table can grow indefinitely.
Recommended fix: Add periodic pruning or prune during startup and on write paths with rate limiting.

### Issue: WebSocket identity is tied to transient socket IDs
Risk level: Medium
Description: Terminal control is keyed by `socket.id` in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts#L91) and [TerminalSessionService.ts](/c:/dev/SerialHub/packages/backend/src/services/TerminalSessionService.ts#L6). A reconnect creates a new socket ID, so an in-progress terminal session cannot be resumed safely and stale locks are more likely after partial failures.
Recommended fix: Use a durable session token or terminal session ID rather than raw Socket.IO connection IDs as the controller identity.

### Issue: Authorization is still uneven for read paths
Risk level: Low
Description: Node CRUD is now admin-protected and run access is owner/admin-scoped, but script listing still returns all scripts in [scripts.ts](/c:/dev/SerialHub/packages/backend/src/routes/scripts.ts#L28). Depending on tenancy expectations, that may expose metadata beyond intended audiences.
Recommended fix: Decide whether scripts are global or per-user. If per-user, scope list endpoints accordingly.

## Serial Engine Risks

### Issue: Stale terminal locks can survive process crashes or broken disconnect flows
Risk level: Critical
Description: Terminal sessions are persisted with `status = 'active'` and heartbeats in [TerminalSessionRepository.ts](/c:/dev/SerialHub/packages/backend/src/repositories/TerminalSessionRepository.ts#L33), but there is no sweeper, expiry policy, or startup cleanup in [TerminalSessionService.ts](/c:/dev/SerialHub/packages/backend/src/services/TerminalSessionService.ts#L37). If the backend crashes or disconnect cleanup is skipped, the unique active-session constraint can permanently block control of that node.
Recommended fix: Add TTL-based lease expiry, periodic stale-session reaping, and startup reconciliation that closes orphaned active sessions.

### Issue: Connection manager lifecycle is improved but still not modeled as a full state machine
Risk level: High
Description: `SerialConnectionManager` tracks `connecting`, `connected`, and `closing`, but reconnect logic is still event-driven and implicit in [SerialConnectionManager.ts](/c:/dev/SerialHub/packages/backend/src/services/SerialConnectionManager.ts#L124). There is no explicit terminal state for failed, reconnecting, or shutdown-draining phases, and no per-node write queue.
Recommended fix: Replace ad hoc event transitions with a formal node connection state machine that includes reconnecting, failed, draining, and idle states.

### Issue: Backpressure is detected but not handled
Risk level: High
Description: `write()` logs when `socket.write()` returns `false`, but it does not pause writers, queue output, or wait for `drain` in [SerialConnectionManager.ts](/c:/dev/SerialHub/packages/backend/src/services/SerialConnectionManager.ts#L180). Under load this can still overwhelm memory or reorder behavior at higher layers.
Recommended fix: Add bounded write queues and `drain`-aware flow control per node.

### Issue: Graceful shutdown does not explicitly drain active serial connections
Risk level: Medium
Description: On `SIGINT` and `SIGTERM`, the app closes the HTTP server and database in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts#L155), but it does not actively close node sockets or mark terminal sessions errored/closed.
Recommended fix: Close all serial connections, flush terminal session state, and mark in-flight runs/sessions appropriately before process exit.

### Issue: Node switching and reconnect UX are fragile
Risk level: Medium
Description: The frontend relies on a connected socket ID before requesting terminal control in [terminal/page.tsx](/c:/dev/SerialHub/packages/frontend/src/app/terminal/page.tsx#L102), but there is no explicit resume or rebind flow if the socket reconnects after control has been acquired. That creates reliability gaps under transient network issues.
Recommended fix: Introduce a durable terminal control token and explicit resume/renew APIs.

## Performance Review

### Issue: The script engine still uses blocking filesystem operations on request paths
Risk level: Medium
Description: Log directory creation and recent-log retrieval rely on synchronous filesystem calls such as `existsSync`, `mkdirSync`, `statSync`, `openSync`, and `readSync` in [ScriptService.ts](/c:/dev/SerialHub/packages/backend/src/services/ScriptService.ts#L74) and [ScriptService.ts](/c:/dev/SerialHub/packages/backend/src/services/ScriptService.ts#L113). This blocks the Node.js event loop under load.
Recommended fix: Move log access to async APIs or stream reads directly to the client.

### Issue: Per-request filtering happens in memory for run listings
Risk level: Low
Description: `GET /runs` loads all detailed runs and filters them in process in [runs.ts](/c:/dev/SerialHub/packages/backend/src/routes/runs.ts#L13). This is acceptable for small datasets but does not scale.
Recommended fix: Push owner/admin filtering into the SQL query layer.

### Issue: WebSocket and script broadcasts are partially underused and potentially wasteful
Risk level: Low
Description: The script engine emits to `script-run:${id}` rooms in [ScriptService.ts](/c:/dev/SerialHub/packages/backend/src/services/ScriptService.ts#L162), but there is no visible client room-join flow. That is not harmful, but it indicates incomplete event design and possible wasted fan-out complexity.
Recommended fix: Either implement explicit room subscription for run monitoring or remove the unused broadcast path until needed.

## Database Review

### Issue: SQLite remains a single-node coordination boundary
Risk level: High
Description: The code now persists sessions and terminal locks in SQLite, which is better than pure in-memory coordination, but the design still assumes one backend instance with local file access. Horizontal scaling would break control invariants immediately.
Recommended fix: Treat the current design as single-instance only, and plan a move to PostgreSQL plus external coordination before multi-instance deployment.

### Issue: Migration 003 is not idempotent at the SQL level
Risk level: Medium
Description: `003_session_and_terminal_hardening.sql` uses `ALTER TABLE ... ADD COLUMN` without guards in [003_session_and_terminal_hardening.sql](/c:/dev/SerialHub/packages/backend/src/migrations/003_session_and_terminal_hardening.sql#L8). The migrations table prevents reruns in normal flows, but manual replay or partial-failure recovery is brittle.
Recommended fix: Use a migration framework with checksums and safer conditional schema evolution, or make additive migrations robust against partial application.

### Issue: Session and terminal cleanup data paths are incomplete
Risk level: Medium
Description: Tables and indexes exist for sessions and active terminal uniqueness, but there is no routine that closes stale active terminal sessions or prunes expired sessions in practice.
Recommended fix: Add startup and periodic maintenance jobs for sessions and terminal locks.

### Issue: Query patterns are acceptable but not fully optimized for future scale
Risk level: Low
Description: The prior N+1 for script listing has been improved, but some access control filtering still happens after query materialization and there are no pagination strategies for nodes, scripts, or runs.
Recommended fix: Add paginated endpoints and server-side filters before the dataset grows.

## Deployment Review

### Issue: Containers still run as root and lack hardening
Risk level: Medium
Description: Neither Dockerfile defines a non-root user in [packages/backend/Dockerfile](/c:/dev/SerialHub/packages/backend/Dockerfile#L13) or [packages/frontend/Dockerfile](/c:/dev/SerialHub/packages/frontend/Dockerfile#L11). This is unnecessary privilege for a production deployment.
Recommended fix: Create and run as an unprivileged user in both images and mark writable directories explicitly.

### Issue: Deployment lacks health checks and readiness signals
Risk level: Medium
Description: `docker-compose.yml` defines no container health checks in [docker-compose.yml](/c:/dev/SerialHub/docker/docker-compose.yml#L1). Startup order depends only on `depends_on`, which does not guarantee application readiness.
Recommended fix: Add health checks for backend `/api/health/ready`, frontend HTTP readiness, and Nginx.

### Issue: Production networking and TLS are still incomplete
Risk level: Medium
Description: Nginx is the only public entrypoint now, which is good, but the deployment still exposes only plain HTTP on port 80 and there is no TLS termination, HSTS, or secret-management beyond environment variables.
Recommended fix: Add TLS termination and environment-specific secret injection before real production use.

### Issue: Environment management is still minimal
Risk level: Low
Description: Compose only requires `SESSION_SECRET` explicitly in [docker-compose.yml](/c:/dev/SerialHub/docker/docker-compose.yml#L13). Google OAuth settings, frontend URL correctness, and callback alignment still rely on external discipline rather than validated deployment config.
Recommended fix: Add a deployment template and startup validation for all required production env vars.

## Code Quality Review

### Issue: Type safety still degrades at the framework boundaries
Risk level: Medium
Description: Socket.IO wrapper code still uses `any` for middleware wrapping and `socket.request` access in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts#L71). The frontend terminal page also uses `any` for xterm and socket refs in [terminal/page.tsx](/c:/dev/SerialHub/packages/frontend/src/app/terminal/page.tsx#L24).
Recommended fix: Add explicit socket/request typings and a typed abstraction for terminal client state.

### Issue: Operational files remain moderately complex
Risk level: Medium
Description: `app.ts`, `SerialConnectionManager.ts`, and `ScriptService.ts` are each carrying multiple responsibilities and sizable control flow. This is manageable now but will become fragile as more terminal or automation features are added.
Recommended fix: Split policy, transport, persistence, and IO concerns into narrower modules.

### Issue: Logging is improved but still not production-observable enough
Risk level: Medium
Description: Request logs include `userId` now in [requestLogger.ts](/c:/dev/SerialHub/packages/backend/src/middleware/requestLogger.ts#L10), but there are still no correlation IDs, run IDs on all relevant flows, metrics, or log persistence strategy in [logger.ts](/c:/dev/SerialHub/packages/backend/src/config/logger.ts#L4).
Recommended fix: Add correlation IDs and metrics around serial connections, reconnects, terminal locks, script duration, and script failures.

### Issue: Automated verification exists but is still narrow
Risk level: Medium
Description: A basic test harness now validates session store and terminal lock behavior, but coverage for OAuth/session flows, reconnect behavior, terminal disconnect cleanup, and script timeout edge cases is still missing.
Recommended fix: Add integration tests for HTTP plus Socket.IO flows and focused unit tests for reconnect and stale-lock cleanup behavior.
