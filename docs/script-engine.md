# Script Engine

The script engine executes stored command sequences against a node and records the resulting run history and log output.

## Data Model

Relevant tables:

- `scripts`
- `scriptRuns`

Scripts store commands in `commandsJson`. Each command is a JSON object like:

```ts
interface ScriptCommand {
  text: string;
  delayMs?: number;
}
```

The current public route validation does not expose per-command timeout overrides. Script-level `timeoutMs` is stored on the script record.

## Service

Primary implementation:

- `packages/backend/src/services/ScriptService.ts`

## Execution Flow

1. The frontend or client calls `POST /api/scripts/:id/execute`
2. Backend validates the script and target node
3. Owner checks confirm the caller can access both resources
4. Non-admin users cannot execute a script owned by one tenant against a node owned by another tenant
5. The service opens or reuses the node transport
6. Commands are sent sequentially
7. Output is captured and appended to the run log
8. `scriptRuns` is updated to `completed`, `failed`, or `cancelled`

## Safety Rules

- scripts cannot run on a node with an active conflicting terminal session
- scripts use the same transport abstraction as terminal sessions
- output logs are capped and accessed through owner-scoped routes

## API Endpoints

- `GET /api/scripts`
- `POST /api/scripts`
- `GET /api/scripts/:id`
- `PUT /api/scripts/:id`
- `DELETE /api/scripts/:id`
- `POST /api/scripts/:id/execute`
- `GET /api/scripts/:id/runs`
- `GET /api/runs`
- `GET /api/runs/:id`
- `GET /api/runs/:id/log`

## Logging

Each run writes to a dedicated log file referenced by `scriptRuns.outputFilePath`.

Run output can be retrieved:

- inline through `GET /api/runs/:id`
- as a file download through `GET /api/runs/:id/log`

## Current Limitations

- no separate test engine evaluation layer is wired into script execution yet
- cancellation support is still limited
- script scheduling is not implemented
