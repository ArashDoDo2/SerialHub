# Roadmap

This roadmap is organized as milestone-sized GitHub issue candidates, ordered by product value and engineering leverage.

## Principles

- keep the core control-plane workflow reliable before adding niche protocol features
- pay down backend/frontend hotspot complexity before expanding the terminal surface
- prioritize diagnostics, operator trust, and multi-tenant support over novelty
- defer serial file transfer unless a concrete device workflow requires it

## M1 Core Stability

### [ ] Extract backend realtime orchestration out of `packages/backend/src/app.ts`

Acceptance criteria:

- terminal Socket.IO handlers are moved behind a dedicated module or gateway boundary
- AI namespace wiring is separated from generic app bootstrap
- shutdown logic is isolated and testable
- runtime behavior is unchanged from the operator perspective
- existing backend tests continue to pass

### [ ] Split `packages/frontend/src/app/terminal/page.tsx` into smaller components and hooks

Acceptance criteria:

- terminal rendering, realtime transport, AI panels, and debug tooling are separated into focused units
- stateful logic is moved into hooks or feature modules
- the page remains functionally equivalent after refactor
- terminal-specific UI becomes easier to test in isolation

### [ ] Harden terminal session lifecycle and lock recovery

Acceptance criteria:

- reconnect and disconnect flows are explicit and deterministic
- stale terminal locks are cleaned up reliably
- crash recovery behavior is covered by tests
- terminal ownership and expiry failures are visible in the UI

### [ ] Expand frontend test coverage for critical operator flows

Acceptance criteria:

- terminal claim/release flows have automated coverage
- nodes, runs, and auth-protected page behavior are tested
- loading, empty, and error states are covered for primary screens

## M2 Operability

### [ ] Introduce a richer connection state model

Acceptance criteria:

- backend distinguishes `connecting`, `ready`, `degraded`, `reconnecting`, `failed`, and `disconnected`
- frontend surfaces those states consistently across dashboard, node, and terminal views
- state transitions are exercised in tests

### [ ] Improve diagnostics for degraded or silent nodes

Acceptance criteria:

- node and terminal surfaces show last known failure reason
- degraded RFC2217 capability is visible to operators
- transport/probe/auth/session failures are distinguishable in the UI

### [ ] Add protocol trace export and better serial diagnostics

Acceptance criteria:

- operators can export trace data for debugging
- export is access-controlled and auditable
- binary payloads are preserved safely
- trace UX does not interfere with normal terminal control

### [ ] Add pagination and filtering to nodes, runs, scripts, and AI history

Acceptance criteria:

- backend supports query-level pagination and filtering
- owner/admin filtering is pushed into SQL rather than handled only in memory
- frontend supports paged navigation, filters, and robust empty/error states

## M3 Admin And Multi-Tenant

### [ ] Build tenant/admin visibility tooling

Acceptance criteria:

- admins can inspect tenant-owned nodes, scripts, runs, and sessions safely
- owner/admin scope rules remain enforced
- actor identity and scope are clear in the UI

### [ ] Add unified audit history for terminal, script, and AI actions

Acceptance criteria:

- terminal claims/releases, script runs, and AI approvals/rejections appear in a unified history surface
- history can be filtered by node, user, tenant, and time range
- sensitive actions are auditable end-to-end

### [ ] Improve admin support workflows

Acceptance criteria:

- admins can diagnose tenant issues without invisible policy bypass
- support-oriented views expose the information needed for investigation
- actions taken by admins are clearly attributable

## M4 Repeatable Workflows

### [ ] Complete the profiles feature with a clear product purpose

Acceptance criteria:

- profiles have an explicit data model and UI role
- profiles can be applied to the relevant workflow consistently
- docs describe the real behavior rather than placeholders

### [ ] Build a first-class test engine

Acceptance criteria:

- test definitions are stored persistently
- tests can target nodes safely with clear ownership rules
- results, logs, timeouts, and cancellation states are stored and inspectable
- the feature is integrated with existing scripts/runs concepts rather than duplicating them

### [ ] Improve script orchestration and run lifecycle

Acceptance criteria:

- script run status transitions are explicit and reliable
- timeout and cancellation behavior are test-covered
- logs are easier to inspect and download

## M5 Assisted Operations

### [ ] Fully persist AI agent configuration and assignment

Acceptance criteria:

- observer, copilot, and automation configuration survives restart
- mode, node assignment, and ownership are persisted
- policy enforcement remains intact after restart/recovery

### [ ] Strengthen AI approval and policy workflows

Acceptance criteria:

- pending approvals are clearly visible to operators
- approval/rejection history is auditable
- stale pending actions are cleaned up safely
- read-only and mutating tool policies are explicit and understandable

### [ ] Improve operator UX for AI-assisted actions

Acceptance criteria:

- effective permissions are understandable before approval
- automation session lifecycle is visible in the UI
- AI action failures are easy to diagnose

## M6 Production Hardening

### [ ] Strengthen deployment validation and startup checks

Acceptance criteria:

- invalid origins, missing secrets, and bad auth configuration fail fast
- deployment scripts and docs reflect the actual supported modes
- production-only assumptions are validated at startup

### [ ] Improve observability hooks for production support

Acceptance criteria:

- structured logs cover connection failures, lock contention, script failures, and automation actions
- correlation IDs or equivalent request/session tracing is available
- high-value failure paths are easy to search and diagnose

### [ ] Prepare the codebase for post-SQLite evolution

Acceptance criteria:

- SQLite-specific assumptions are isolated behind clearer boundaries
- a migration path to PostgreSQL or another multi-instance-ready store is documented
- data access patterns are easier to evolve without rewriting the product surface

## Backlog / Defer

### [ ] Serial file transfer over serial transport

Only start this if a concrete customer or device-family workflow justifies it.

Acceptance criteria:

- first version is narrowly scoped to a recovery-oriented use case such as `XMODEM` upload
- file transfer uses a dedicated backend session flow rather than normal terminal typing
- the feature does not compromise normal terminal reliability

## Suggested Implementation Order

1. Extract backend realtime/runtime modules
2. Split the terminal page into components/hooks
3. Harden terminal session lifecycle and recovery
4. Expand connection states and diagnostics
5. Add trace export and better observability
6. Add pagination/filtering and admin visibility improvements
7. Complete profiles, test engine, and script orchestration improvements
8. Harden AI approval and policy flows
9. Tighten production validation and database evolution boundaries
10. Revisit niche features like serial file transfer only when driven by real demand

## M1 Detailed Backlog

This section breaks `M1 Core Stability` into implementation-ready work items with rough sizing and dependency order.

### Recommended execution order

1. backend module extraction
2. terminal page decomposition
3. terminal session lifecycle hardening
4. frontend test coverage

### Issue M1-01: Extract Socket.IO terminal orchestration from `packages/backend/src/app.ts`

Size: `M`

Depends on:

- none

Scope:

- move terminal socket event registration into a dedicated module
- separate socket auth/session wrapping from terminal event handlers
- keep current event names and payload shapes stable

Acceptance criteria:

- `app.ts` no longer contains the full terminal socket event implementation
- terminal socket registration is isolated behind a clear function or service boundary
- session/auth wiring still works for Socket.IO clients
- no behavior change for subscribe, unsubscribe, heartbeat, input, and disconnect flows

Definition of done:

- backend tests pass
- startup and shutdown behavior remains intact
- logs still identify terminal lifecycle events correctly

### Issue M1-02: Extract AI Socket.IO namespaces from `packages/backend/src/app.ts`

Size: `M`

Depends on:

- `M1-01`

Scope:

- move `/ai-observers`, `/ai-copilot`, and `/ai-automation` namespace setup into dedicated modules
- separate namespace auth from event handling logic
- keep service integration unchanged

Acceptance criteria:

- `app.ts` is reduced to high-level bootstrap and registration
- each AI namespace has a dedicated registration module
- observer, copilot, and automation flows remain behaviorally unchanged

Definition of done:

- backend tests covering AI flows still pass
- namespace auth failures still return the same effective errors

### Issue M1-03: Isolate shutdown and maintenance lifecycle handling

Size: `S`

Depends on:

- `M1-01`

Scope:

- extract interval-based maintenance work and SIGINT/SIGTERM cleanup into dedicated runtime helpers
- centralize graceful shutdown behavior

Acceptance criteria:

- maintenance timer setup is not embedded directly in `app.ts`
- shutdown cleanup for sessions, serial connections, and running script state is centralized
- signal handling behavior remains unchanged

Definition of done:

- the shutdown path is easier to inspect and test
- no duplicate cleanup logic remains in `app.ts`

### Issue M1-04: Split `packages/frontend/src/app/terminal/page.tsx` into layout and feature modules

Size: `L`

Depends on:

- none

Scope:

- extract terminal shell/panels into smaller components
- separate data/state hooks from presentation
- preserve current URL/query-parameter behavior

Acceptance criteria:

- terminal page no longer contains all UI sections inline
- major areas such as node/session controls, terminal display, AI panels, and debug panels are separated
- behavior remains unchanged for existing user flows

Definition of done:

- page readability is substantially improved
- local state ownership is clearer and easier to reason about

### Issue M1-05: Extract realtime terminal client logic into hooks/services

Size: `L`

Depends on:

- `M1-04`

Scope:

- isolate Socket.IO client setup, subscription lifecycle, and terminal event handling
- isolate xterm lifecycle from surrounding React layout code
- keep current event names and payload handling stable

Acceptance criteria:

- socket connection logic is no longer embedded throughout the page component
- xterm mounting and write logic is separated from panel rendering
- reconnect, disconnect, and event cleanup paths are explicit

Definition of done:

- terminal-specific logic can be tested with minimal UI scaffolding
- page-level component is primarily composition and state wiring

### Issue M1-06: Harden terminal lock expiry and reconnect behavior

Size: `M`

Depends on:

- `M1-01`
- `M1-05`

Scope:

- review lock ownership model and heartbeat handling
- tighten reconnect semantics for transient socket loss
- improve user-visible errors for expired or stolen sessions

Acceptance criteria:

- reconnect behavior is deterministic and documented
- expired sessions are handled consistently between backend and frontend
- operators receive clear guidance when they lose terminal control

Definition of done:

- backend tests cover reconnect and stale-session scenarios more thoroughly
- frontend shows explicit state instead of generic failure messaging

### Issue M1-07: Add backend coverage for crash recovery and reconnect edge cases

Size: `M`

Depends on:

- `M1-06`

Scope:

- extend existing backend tests around terminal sessions and serial connection recovery
- cover crash-recovery, reconnect, and lock-expiry edge cases

Acceptance criteria:

- tests exist for stale session cleanup after restart
- tests exist for reconnect flows where the controller temporarily disconnects
- tests exist for lock expiry while a UI still believes it has control

Definition of done:

- M1 terminal lifecycle changes are protected against regression

### Issue M1-08: Add frontend tests for terminal claim/release and loading/error states

Size: `M`

Depends on:

- `M1-04`
- `M1-05`

Scope:

- add automated coverage for primary terminal UX states
- cover node loading, connection failure, lock loss, and basic interaction flows

Acceptance criteria:

- tests cover successful terminal claim and release
- tests cover loading, empty, and error states
- tests cover at least one lock-expired or forbidden flow

Definition of done:

- regressions in terminal UX can be caught without manual verification only

### Suggested M1 slices for PRs

- PR 1: `M1-01` and `M1-03`
- PR 2: `M1-02`
- PR 3: `M1-04`
- PR 4: `M1-05`
- PR 5: `M1-06` and `M1-07`
- PR 6: `M1-08`
