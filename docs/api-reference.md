# API Reference

All protected backend routes are mounted under `/api`. Auth routes live under `/api/auth`. Most routes require an authenticated session.

## Authentication

- `GET /api/auth/google` - start Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/google/failure` - OAuth failure result
- `POST /api/auth/login` - development-only local login
- `POST /api/auth/logout` - destroy current session
- `GET /api/auth/me` - return current authenticated user or `401`

## Health

- `GET /api/health`
- `GET /api/health/ready`

## Nodes

- `GET /api/nodes` - list nodes for the current owner, or all nodes for admins
- `POST /api/nodes` - create a node owned by the current user
- `GET /api/nodes/:id` - get one node, owner-or-admin
- `PUT /api/nodes/:id` - update one node, owner-or-admin
- `DELETE /api/nodes/:id` - delete one node, owner-or-admin
- `POST /api/nodes/:id/test` - run a live reachability test, owner-or-admin

### Node payload

```json
{
  "name": "Lab Router Console",
  "description": "Rack A serial port",
  "connectionType": "rfc2217",
  "host": "192.168.1.100",
  "port": 2217,
  "baudRate": 115200,
  "dataBits": 8,
  "parity": "none",
  "stopBits": 1,
  "isActive": true
}
```

## Terminal

- `POST /api/terminal/start`
  - body: `{ "nodeId": 1, "controllerKey": "client-generated-key" }`
- `POST /api/terminal/stop`
  - body: `{ "nodeId": 1, "controllerKey": "client-generated-key" }`

Terminal data and control messages are transported over Socket.IO after the REST session is created.

## Scripts

- `GET /api/scripts`
- `POST /api/scripts`
- `GET /api/scripts/:id`
- `PUT /api/scripts/:id`
- `DELETE /api/scripts/:id`
- `POST /api/scripts/:id/execute`
  - body: `{ "nodeId": 1 }`
- `GET /api/scripts/:id/runs`

### Script payload

```json
{
  "name": "Version Check",
  "description": "Read basic version information",
  "commands": [
    { "text": "show version", "delayMs": 200 }
  ],
  "defaultDelayMs": 100,
  "timeoutMs": 10000
}
```

## Runs

- `GET /api/runs` - list runs visible to the current owner, or all runs for admins
- `GET /api/runs/:id` - run details plus inline output, owner-or-admin
- `GET /api/runs/:id/log` - download stored run log, owner-or-admin

## AI Observer

- `GET /api/ai-observers`
- `POST /api/ai-observers`
- `DELETE /api/ai-observers/:id`
- `GET /api/ai-observations?nodeId=:id&limit=:n`

## AI Copilot

- `GET /api/ai-copilot/suggestions?nodeId=:id&limit=:n`

## AI Automation

- `GET /api/ai-automation/actions?nodeId=:id&limit=:n`
- `GET /api/ai-automation/sessions/:terminalSessionId`
- `POST /api/ai-automation/sessions/start`
- `POST /api/ai-automation/sessions/stop`
- `POST /api/ai-automation/actions/:id/approve`
- `POST /api/ai-automation/actions/:id/reject`

## Socket.IO Terminal Events

Client to server:

- `terminal:subscribe` - `{ nodeId, controllerKey, sessionId? }`
- `terminal:unsubscribe` - `{ nodeId, controllerKey?, sessionId? }`
- `terminal:input` - `{ nodeId?, data }`
- `terminal:heartbeat` - `{ nodeId, controllerKey, sessionId? }`

Server to client:

- `terminal:data`
- `terminal:connected`
- `terminal:disconnected`
- `terminal:error`
- `terminal:capabilities`
- `terminal:trace` when debug tracing is enabled

## Errors

Validation and business logic errors are returned as JSON. Typical shapes:

```json
{ "error": "Forbidden" }
```

```json
{ "errors": { "name": { "_errors": ["Required"] } } }
```
