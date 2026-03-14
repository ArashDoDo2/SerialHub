# Backend Security Audit

## 1. Executive Summary

SerialHub's backend has materially improved tenant isolation for the primary HTTP resource flows:

- `nodes`
- `scripts`
- `runs`
- terminal start
- AI list/query routes

The current backend is not wide open to trivial cross-tenant API reads in those core paths. The main residual risks are now concentrated in three areas:

1. a configuration-level admin bypass through `LOCAL_AUTH_ENABLED`
2. a websocket-side terminal session release path that trusts `controllerKey` too much
3. AI automation approvals that can outlive the active AI session

These are meaningful production risks because the system controls remote hardware devices and serial sessions. Two of them can directly affect availability or control integrity. One of them can completely collapse authentication if enabled in the wrong environment.

## 2. Threat Model

### Assets

- serial node control
- live terminal sessions
- script execution on remote hardware
- per-user tenant data:
  - nodes
  - scripts
  - runs
  - AI observers/copilot/automation state
- run logs and terminal-derived outputs
- AI automation control plane

### Attackers Considered

- authenticated standard user trying to access another user's hardware
- authenticated websocket client trying to bypass event-level authorization
- malicious or compromised AI agent using observer/copilot/automation channels
- operator misconfiguration exposing development authentication in production

### Trust Boundaries

- browser -> Express API
- browser -> Socket.IO session
- AI agent -> AI websocket namespaces
- backend -> SQLite
- backend -> serial transports

## 3. Tenant Isolation Review

### What Is Working

- Node list/detail/mutation routes are owner-scoped or admin-scoped in [nodes.ts](/c:/dev/SerialHub/packages/backend/src/routes/nodes.ts).
- Script list/detail/mutation/execution routes enforce owner-or-admin checks in [scripts.ts](/c:/dev/SerialHub/packages/backend/src/routes/scripts.ts).
- Run list/detail/download routes are owner-scoped in [runs.ts](/c:/dev/SerialHub/packages/backend/src/routes/runs.ts).
- AI observer, copilot, and automation read/list APIs are owner-scoped or admin-scoped in:
  - [ai-observers.ts](/c:/dev/SerialHub/packages/backend/src/routes/ai-observers.ts)
  - [ai-observations.ts](/c:/dev/SerialHub/packages/backend/src/routes/ai-observations.ts)
  - [ai-copilot.ts](/c:/dev/SerialHub/packages/backend/src/routes/ai-copilot.ts)
  - [ai-automation.ts](/c:/dev/SerialHub/packages/backend/src/routes/ai-automation.ts)
- Script-to-node cross-tenant execution is explicitly blocked in [ScriptService.ts](/c:/dev/SerialHub/packages/backend/src/services/ScriptService.ts).

### Finding 1: `LOCAL_AUTH_ENABLED` collapses tenant isolation and authentication

- Severity: Critical
- Affected files:
  - [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts)
  - [auth.ts](/c:/dev/SerialHub/packages/backend/src/middleware/auth.ts)
  - [env.ts](/c:/dev/SerialHub/packages/backend/src/config/env.ts)
  - [auth.ts](/c:/dev/SerialHub/packages/backend/src/routes/auth.ts)

#### Exact risk

When `LOCAL_AUTH_ENABLED=true`, the backend auto-attaches the local master admin user to requests and websocket handshakes even when the caller is not logged in:

- HTTP: `attachLocalDevUser`
- websocket: `if (!request.user && config.localAuth.enabled) request.user = findOrCreateLocalMaster()`

This is not limited to a one-time local login flow. It becomes an ambient authentication bypass.

#### Exploit scenario

If production is started with `LOCAL_AUTH_ENABLED=true`, any unauthenticated client can call protected APIs or open Socket.IO connections as the local master admin user.

#### Why it matters

This is total loss of tenant isolation and admin boundary. A misconfiguration turns the SaaS backend into effectively unauthenticated admin access.

#### Recommended remediation

- Restrict auto-attach local auth to development only.
- Remove ambient auto-attachment from API and websocket paths.
- Require an explicit login exchange even in local-auth mode.
- Fail startup if `LOCAL_AUTH_ENABLED=true` outside development.

### Finding 2: ownership backfill for `deviceProfiles` and `testRuns` is operationally lossy

- Severity: Low
- Affected files:
  - [001_initial_schema.sql](/c:/dev/SerialHub/packages/backend/src/migrations/001_initial_schema.sql)
  - [008_multi_tenant_ownership.sql](/c:/dev/SerialHub/packages/backend/src/migrations/008_multi_tenant_ownership.sql)
  - [migrations.ts](/c:/dev/SerialHub/packages/backend/src/config/migrations.ts)

#### Exact risk

Legacy `deviceProfiles` rows are backfilled to an admin or first user because the legacy schema had no owner field. That does not create an immediate API leak today because profiles/test APIs are not implemented, but it can produce incorrect ownership assignments for future profile/test features.

#### Exploit scenario

When profile APIs are added later, a user may unexpectedly inherit or lose access to legacy profile/test data because ownership was backfilled heuristically.

#### Why it matters

This is a future tenant-isolation footgun rather than a current exploit path.

#### Recommended remediation

- Add an explicit migration strategy for legacy profile ownership.
- Avoid using admin fallback ownership for shared profile data without a shared-resource model.

## 4. WebSocket Security Review

### What Is Working

- Socket.IO handshake loads session middleware and passport in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts).
- `terminal:subscribe` now checks node ownership before attaching a subscriber in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts).
- `terminal:input` checks both:
  - owner/admin access to the node
  - active terminal session ownership
- `terminal:heartbeat` also re-checks ownership and active session state.

### Finding 3: `terminal:unsubscribe` can close another controller session if `controllerKey` is known

- Severity: High
- Affected files:
  - [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts)
  - [TerminalSessionService.ts](/c:/dev/SerialHub/packages/backend/src/services/TerminalSessionService.ts)
  - [TerminalSessionRepository.ts](/c:/dev/SerialHub/packages/backend/src/repositories/TerminalSessionRepository.ts)

#### Exact risk

`terminal:unsubscribe` does this:

- trusts `payload.controllerKey ?? socket.data.controllerKey`
- always calls `terminalSessionService.release(controllerKey, 'closed')`
- does not verify that the active session behind that `controllerKey` belongs to the calling user

That means the websocket event is weaker than the HTTP `/api/terminal/stop` route, which does verify session ownership.

#### Exploit scenario

An authenticated client that learns or guesses another session's `controllerKey` can emit `terminal:unsubscribe` and forcibly close the other user's active controller session. This is primarily a targeted denial-of-service against terminal control.

#### Why it matters

This weakens the single-controller invariant and allows a websocket-side bypass of the safer stop path.

#### Recommended remediation

- Resolve the active session by `controllerKey` before releasing it.
- Require `activeSession.userId === socket.user.id` or admin override before release.
- Do not trust client-supplied `controllerKey` by itself.

### Finding 4: `controllerKey` remains a client-side bearer secret

- Severity: Medium
- Affected files:
  - [terminal.ts](/c:/dev/SerialHub/packages/backend/src/routes/terminal.ts)
  - [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts)
  - [TerminalSessionService.ts](/c:/dev/SerialHub/packages/backend/src/services/TerminalSessionService.ts)

#### Exact risk

The controller session identity is anchored to a client-generated `controllerKey`. The backend does not generate, rotate, or strength-check this value.

#### Exploit scenario

If a client uses a predictable or reused `controllerKey`, or if that value leaks through browser tooling or logs, another client may be able to interfere with the same terminal session. The main concrete abuse path today is the `terminal:unsubscribe` issue above.

#### Why it matters

The control lock is only as strong as a client-generated secret plus current event validation.

#### Recommended remediation

- Generate controller tokens server-side.
- Bind them to session and user identity.
- Treat them like opaque server-issued capabilities, not client-defined ids.

### Finding 5: websocket attach ordering still depends on a route-event handshake

- Severity: Medium
- Affected files:
  - [terminal.ts](/c:/dev/SerialHub/packages/backend/src/routes/terminal.ts)
  - [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts)

#### Exact risk

Terminal control is established through a multi-step sequence:

1. `POST /api/terminal/start`
2. websocket `terminal:subscribe`
3. websocket `terminal:input`

The event layer now checks ownership, but the design still depends on consistent state across HTTP session, websocket state, `controllerKey`, and `socket.data`.

#### Exploit scenario

A reconnect or stale client can end up holding outdated local state and trigger confusing authorization failures or forced cleanup flows. This is not a clean privilege escalation today, but it is an attack surface where state desynchronization matters.

#### Why it matters

Serial control is high-value. Complex attach sequencing increases the chance of future bypasses or operator confusion under reconnect stress.

#### Recommended remediation

- Move toward a single server-issued terminal lease token.
- Require that token on every mutating terminal event.
- Make websocket attach explicitly acknowledge the lease and node binding.

## 5. AI Tool Security Review

### What Is Working

- Observer mode cannot call write tools. It only stores observations in [AIObserverService.ts](/c:/dev/SerialHub/packages/backend/src/services/AIObserverService.ts).
- Copilot mode only exposes read-only tools in [AICopilotService.ts](/c:/dev/SerialHub/packages/backend/src/services/AICopilotService.ts).
- Automation mode routes mutating behavior through [ToolRegistry.ts](/c:/dev/SerialHub/packages/backend/src/services/ToolRegistry.ts).
- Tool execution verifies node ownership and script ownership in [ToolRegistry.ts](/c:/dev/SerialHub/packages/backend/src/services/ToolRegistry.ts).
- Mutating AI actions are audited in `ai_tool_actions`.

### Finding 6: pending AI actions can survive session stop and be approved later

- Severity: High
- Affected files:
  - [AIAutomationService.ts](/c:/dev/SerialHub/packages/backend/src/services/AIAutomationService.ts)
  - [AIAutomationSessionRepository.ts](/c:/dev/SerialHub/packages/backend/src/repositories/AIAutomationSessionRepository.ts)
  - [ai-automation.ts](/c:/dev/SerialHub/packages/backend/src/routes/ai-automation.ts)

#### Exact risk

`approveAction()` only checks:

- action exists
- action is pending approval
- approving user can access the node

It does not verify that:

- the automation session is still active
- the terminal session is still active
- the AI session has not been stopped since the action was proposed

#### Exploit scenario

An AI agent proposes `serial.write` or `script.run`, then the AI session is stopped. The pending action remains in the database. A user can still approve it later and the backend will execute it.

#### Why it matters

This violates the expected safety property that stopping AI automation revokes future write capability for that session.

#### Recommended remediation

- On approval, verify that the referenced automation session is still active.
- On AI session stop, auto-cancel or invalidate all pending actions for that session.
- Include automation-session state in approval authorization.

### Finding 7: AI auth tokens are long-lived bearer secrets stored and returned in plaintext

- Severity: Medium
- Affected files:
  - [AIObserverRepository.ts](/c:/dev/SerialHub/packages/backend/src/repositories/AIObserverRepository.ts)
  - [ai-observers.ts](/c:/dev/SerialHub/packages/backend/src/routes/ai-observers.ts)
  - [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts)

#### Exact risk

AI agents authenticate with static `authToken` values:

- generated once
- stored in plaintext
- returned by the API
- accepted directly in websocket handshake auth

There is no expiry, rotation, hashing, or binding to endpoint/origin.

#### Exploit scenario

If an observer token is leaked from the database, browser, logs, or an admin panel response, an attacker can attach to the corresponding AI namespace and consume data or queue automation actions.

#### Why it matters

These tokens protect semi-privileged channels connected to hardware telemetry and control suggestions.

#### Recommended remediation

- Hash stored agent tokens.
- Support explicit rotation and revocation.
- Add optional expiry metadata.
- Avoid returning tokens on ordinary list responses after initial creation.

### Finding 8: AI rate limits are process-local and non-durable

- Severity: Medium
- Affected files:
  - [PolicyEngine.ts](/c:/dev/SerialHub/packages/backend/src/services/PolicyEngine.ts)

#### Exact risk

Rate limiting is stored in an in-memory `Map`. It resets on process restart and does not coordinate across multiple backend instances.

#### Exploit scenario

A noisy or malicious agent can regain full quota after restart or distribute traffic across instances if the service is scaled out.

#### Why it matters

This weakens abuse resistance for AI automation, especially `serial.write` and `script.run`.

#### Recommended remediation

- Persist rate-limit state in a shared store or durable table.
- Include session or terminal binding if quotas should be scoped tighter.

### Finding 9: approval/audit records do not bind execution to the original human session context

- Severity: Low
- Affected files:
  - [AIAutomationService.ts](/c:/dev/SerialHub/packages/backend/src/services/AIAutomationService.ts)
  - [AIToolActionRepository.ts](/c:/dev/SerialHub/packages/backend/src/repositories/AIToolActionRepository.ts)

#### Exact risk

Audit records capture:

- observer id
- node id
- tool name
- arguments
- result
- approving user id

But they do not capture enough context to prove that execution occurred while the related terminal/automation session was still active.

#### Exploit scenario

Post-incident review can show that a user approved an action, but not whether the live AI session had already ended.

#### Why it matters

This is mainly a forensic weakness that compounds Finding 6.

#### Recommended remediation

- Record automation-session state and terminal-session state at execution time.
- Mark late approvals explicitly.

## 6. File/Log Access Review

### What Is Working

- Run log download in [runs.ts](/c:/dev/SerialHub/packages/backend/src/routes/runs.ts) is owner-scoped before `res.download`.
- Log filenames are generated server-side from run ids in [ScriptService.ts](/c:/dev/SerialHub/packages/backend/src/services/ScriptService.ts).

### Finding 10: log download trusts DB file paths directly

- Severity: Low
- Affected files:
  - [runs.ts](/c:/dev/SerialHub/packages/backend/src/routes/runs.ts)
  - [ScriptService.ts](/c:/dev/SerialHub/packages/backend/src/services/ScriptService.ts)
  - [ScriptRunRepository.ts](/c:/dev/SerialHub/packages/backend/src/repositories/ScriptRunRepository.ts)

#### Exact risk

`GET /api/runs/:id/log` downloads whatever path is stored in `outputFilePath` after owner check. The current application only writes controlled log paths, but the route does not constrain downloads to a known log root.

#### Exploit scenario

If `outputFilePath` is ever poisoned through another bug, operator mistake, or direct DB manipulation, the endpoint becomes an arbitrary file read path for the authorized tenant of that run.

#### Why it matters

This is not directly exploitable from the current API surface, but it is a brittle trust boundary.

#### Recommended remediation

- Enforce that `outputFilePath` resolves under a known log directory before download.
- Prefer deriving log paths from `runId` instead of trusting the DB value directly.

## 7. Session/Auth Review

### What Is Working

- Session cookies are `httpOnly`.
- Production cookies are marked `secure`.
- OAuth state parameter is validated in [auth.ts](/c:/dev/SerialHub/packages/backend/src/routes/auth.ts).
- CSRF origin/referer validation exists for non-safe methods in [csrf.ts](/c:/dev/SerialHub/packages/backend/src/middleware/csrf.ts).
- The backend uses a SQLite session store rather than the default memory store.

### Finding 11: local auth mode is framed as a login system but acts as ambient auth bypass

- Severity: Critical
- Affected files:
  - [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts)
  - [auth.ts](/c:/dev/SerialHub/packages/backend/src/routes/auth.ts)
  - [auth.ts](/c:/dev/SerialHub/packages/backend/src/middleware/auth.ts)
  - [env.ts](/c:/dev/SerialHub/packages/backend/src/config/env.ts)

#### Exact risk

This is the same root issue as Finding 1 but from the auth boundary angle: the presence of a `/login` route is misleading because the system also auto-authenticates requests and websocket connections whenever local auth is enabled.

#### Exploit scenario

An operator believes local auth is gated by `/api/auth/login`, but in reality every unauthenticated request is silently elevated to the local master user.

#### Why it matters

It creates a dangerous false sense of security during deployment and review.

#### Recommended remediation

- Make local auth explicit and interactive.
- Remove silent auto-authentication behavior.

## 8. Risk Matrix

| ID | Title | Severity | Risk Class |
|---|---|---|---|
| 1 | `LOCAL_AUTH_ENABLED` ambient admin bypass | Critical | Tenant leaks / session auth |
| 3 | `terminal:unsubscribe` can close foreign session by `controllerKey` | High | Websocket bypass |
| 6 | Pending AI actions survive session stop | High | AI tool abuse |
| 4 | Client-generated `controllerKey` trust model | Medium | Websocket bypass |
| 5 | Route-event terminal attach sequencing complexity | Medium | Websocket bypass |
| 7 | Plaintext long-lived AI bearer tokens | Medium | AI tool abuse |
| 8 | In-memory non-durable AI rate limits | Medium | AI tool abuse |
| 10 | Run log download trusts DB path | Low | File/log access |
| 2 | Heuristic ownership backfill for profiles/tests | Low | Tenant isolation |
| 9 | Audit trail missing execution-session state | Low | AI tool abuse |
| 11 | Local auth misrepresented as login-only | Critical | Session/auth |

## 9. Recommended Fixes

1. Remove ambient local-auth auto-attachment from API and websocket request paths.
2. Add owner/admin verification to `terminal:unsubscribe` before `release(controllerKey)`.
3. Invalidate all pending AI actions when automation sessions stop.
4. Require approval-time verification that the automation session is still active.
5. Replace client-generated `controllerKey` with a server-issued opaque lease token.
6. Hash AI auth tokens at rest and support token rotation.
7. Move AI rate limiting to a durable/shared store.
8. Restrict log downloads to a known filesystem root.
9. Define an explicit ownership strategy for legacy `deviceProfiles` and `testRuns`.

## 10. Safe Remediation Order

1. Disable ambient local auth outside development.
2. Fix `terminal:unsubscribe` authorization.
3. Revoke pending AI actions on session stop and verify session state on approval.
4. Harden AI token lifecycle and storage.
5. Replace `controllerKey` with server-issued terminal lease tokens.
6. Harden log-path validation.
7. Revisit profile/test ownership before those APIs are exposed.
