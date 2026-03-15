# Roadmap

This file tracks still-open product and engineering themes after the recent transport, AI, and multi-tenant work.

## Near Term

- finish the profile and test engine surfaces
- add richer diagnostics for silent or degraded nodes
- improve admin tooling for tenant visibility and support workflows
- expand backend test coverage for reconnect and crash-recovery paths
- make AI agent management fully persisted, including mode and node assignment

## Medium Term

- move beyond SQLite for multi-instance production scaling
- add stronger operational observability and protocol-level tracing export
- improve policy controls and approval workflows for AI automation
- add scheduling and orchestration for script execution

## Longer Term

- richer device-specific workflows and protocol integrations
- stronger tenant administration and audit UX
- hosted deployment patterns beyond the single-instance SQLite baseline

## Engineering Roadmap

### Immediate fixes

- Add lease expiry and stale-session cleanup for `terminalSessions` so active locks do not survive crashes indefinitely.
- Add CSRF protection or strict Origin validation for all state-changing session-backed endpoints.
- Destroy server-side sessions on logout and schedule pruning of expired rows in the SQLite session store.
- Add explicit shutdown cleanup for active serial connections, terminal sessions, and in-flight script runs.

### Short-term improvements

- Replace socket-ID-based controller ownership with a durable terminal control token that survives reconnects.
- Refactor terminal orchestration out of `app.ts` and move Socket.IO handling behind a dedicated gateway/service boundary.
- Add async log streaming and remove blocking filesystem work from run retrieval and script execution paths.
- Add health checks for backend, frontend, and Nginx in container orchestration.
- Add stronger deployment validation for OAuth URLs, frontend/backend origins, and secret configuration.

### Medium-term improvements

- Introduce a formal connection state machine for serial nodes, including reconnecting, failed, idle, and draining states.
- Add bounded write queues and backpressure-aware handling for serial writes.
- Push owner/admin filtering and pagination into SQL queries for runs, scripts, and nodes.
- Add correlation IDs, metrics, and alertable observability for connection errors, lock contention, and script failures.
- Add integration tests for OAuth callback flow, terminal reconnect flow, and script timeout/cancellation behavior.

### Long-term architecture evolution

- Decouple serial orchestration from the web process into a dedicated worker/service boundary.
- Migrate from SQLite to PostgreSQL plus external coordination before attempting multi-instance deployment.
- Formalize the planned test engine as a first-class domain module only after terminal and script coordination are operationally stable.
- Harden deployment with TLS, non-root containers, secret management, and production-grade rollout/rollback procedures.
