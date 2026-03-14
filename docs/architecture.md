# System Architecture

SerialHub is a browser-based control plane for remote serial endpoints.

It supports two transport types today:

- `raw-tcp`
- `rfc2217`

## High-Level Components

1. Remote serial device or serial server
2. SerialHub backend
3. SerialHub frontend
4. SQLite database and session store
5. Optional AI observer, copilot, and automation clients

## Runtime Flow

```text
[Remote serial endpoint]
          |
          v
[SerialHub backend: transports + terminal/session control]
          |
     HTTP + Socket.IO
          |
          v
[Next.js frontend]
```

## Backend Layers

### Routes

Express routes expose authenticated APIs under `/api`:

- `/api/nodes`
- `/api/terminal`
- `/api/scripts`
- `/api/runs`
- `/api/ai-observers`
- `/api/ai-observations`
- `/api/ai-copilot`
- `/api/ai-automation`

### Services

Key services include:

- `SerialNodeService`
- `SerialConnectionManager`
- `TerminalSessionService`
- `ScriptService`
- `AIObserverService`
- `AICopilotService`
- `AIAutomationService`

### Repositories

Repositories wrap SQLite access and now consistently carry owner-scoped query variants for multi-tenant access control.

## Transport Layer

Transport logic is split from the connection manager:

- `RawTcpTransport`
- `Rfc2217Transport`
- Telnet parser and RFC2217 protocol helpers

The connection manager manages transport instances, subscribers, and state transitions, while transport implementations handle wire-level behavior.

## Terminal Model

- one active controller per node
- terminal sessions persisted in `terminalSessions`
- websocket events for subscribe, unsubscribe, input, heartbeat
- startup reconciliation clears stale active sessions after crashes

## Script Model

- scripts are stored as command arrays in JSON
- runs are recorded in `scriptRuns`
- scripts are owner-scoped
- non-admins cannot execute a script against another user's node

## AI Model

SerialHub currently has three AI subsystems:

- observer: passive analysis of serial output
- copilot: suggestion-only guidance
- automation: tool-based actions with policy and approval

AI subsystems are owner-scoped and do not bypass terminal/session ownership rules.

## Security Model

- authenticated sessions for REST and Socket.IO
- owner-based multi-tenant access control
- admin override
- same-origin checks for state-changing requests
- development-only local auth guarded at startup

## Deployment Shape

The default deployment stack is:

- backend container
- frontend container
- nginx reverse proxy

SQLite data and log directories are mounted as volumes in the compose setup.
