# Backend Architecture

The backend is a TypeScript Express application with SQLite persistence, Socket.IO realtime flows, transport abstractions for serial connectivity, and owner-scoped multi-tenant access control.

## Layers

### Repository Layer

Location:

- `packages/backend/src/repositories`

Responsibilities:

- wrap SQLite queries with typed repository methods
- provide owner-scoped query variants for tenant-aware resources
- persist terminal, run, and AI audit state

### Service Layer

Location:

- `packages/backend/src/services`

Notable services:

- `UserService`
- `SerialNodeService`
- `SerialConnectionManager`
- `TerminalSessionService`
- `ScriptService`
- `AIObserverService`
- `AICopilotService`
- `AIAutomationService`
- `ToolRegistry`

### Routing Layer

Location:

- `packages/backend/src/routes`

Protected APIs are mounted under `/api` after authentication middleware.

### Realtime Layer

Socket.IO is initialized in `packages/backend/src/app.ts`.

Current namespaces include:

- default terminal namespace
- `/ai-observers`
- `/ai-copilot`
- `/ai-automation`

## Auth and Session Model

- Passport-based Google OAuth
- development-only local auth
- SQLite-backed `express-session`
- owner-or-admin access checks for tenant-scoped resources

## Transport Model

The backend uses a transport abstraction rather than hard-coding raw sockets into the manager.

Current transports:

- `RawTcpTransport`
- `Rfc2217Transport`

The RFC2217 transport builds on:

- Telnet parser
- RFC2217 negotiation helpers

## Terminal Model

- terminal sessions are persisted
- one controller per node
- websocket handlers enforce per-event authorization
- heartbeats keep terminal ownership alive
- stale active sessions are reconciled at startup after crashes

## AI Model

AI subsystems are intentionally separated:

- observer: passive observation only
- copilot: suggestion-only
- automation: tool-driven actions with policy and approval

Automation does not bypass the tool registry or tenant checks.
