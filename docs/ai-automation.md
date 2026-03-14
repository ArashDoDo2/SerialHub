# AI Automation

## Purpose

AI Automation allows registered AI agents to request actions through a controlled tool system.

It does not let AI write directly to serial sockets or bypass existing SerialHub control paths.

Human terminal control remains the primary interface.

## Safety Model

- AI agents never receive direct socket access.
- Every action goes through `ToolRegistry`.
- `PolicyEngine` validates tool permissions, node access, approval requirements, and rate limits.
- Mutating tools such as `serial.write` and `script.run` require human approval by default.
- Stopping an AI session does not affect the human terminal session.

## Tool Registry

Supported tools:

- `serial.read`
- `serial.write`
- `script.run`
- `node.info`
- `terminal.snapshot`

Each tool is executed through backend services that already exist in SerialHub:

- `serial.write` -> `SerialConnectionManager.write(...)`
- `script.run` -> `ScriptService.runScript(...)`
- `node.info` -> node repository lookup
- `serial.read` / `terminal.snapshot` -> buffered serial output snapshots

AI agents do not call transports or sockets directly.

## Policy Engine

Policies are stored per registered observer.

Default policy:

- allowed tools:
  - `serial.read`
  - `serial.write`
  - `script.run`
  - `node.info`
  - `terminal.snapshot`
- approval required:
  - `serial.write`
  - `script.run`
- rate limits:
  - read-only tools: 30 per minute
  - `serial.write`: 5 per minute
  - `script.run`: 2 per minute

Policies are enforced before an action is accepted.

## Session Model

AI automation is optional.

It must be explicitly enabled by the human user for an active terminal session. When enabled:

- connected AI agents owned by the same user are attached to that terminal session
- AI agents may propose tool actions
- pending approvals appear in the terminal UI

When disabled or stopped:

- active automation sessions close
- further proposals are rejected
- human terminal access continues normally

## Approval Flow

1. AI agent proposes an action.
2. SerialHub validates policy and node/session access.
3. If approval is required, the action is stored as `pending_approval`.
4. The terminal UI shows the action in the `AI Actions` panel.
5. The user approves or rejects it.
6. Approved actions execute through `ToolRegistry`.
7. Results are stored and emitted back to the UI and AI agent.

## Audit Trail

Every AI action is persisted in `ai_tool_actions`.

Stored fields include:

- agent/observer id
- tool name
- arguments
- status
- result
- approved or rejected by user id
- timestamps

This provides a full audit trail for AI-initiated actions.

## UI

The terminal page includes an `AI Actions` panel.

Users can:

- enable AI automation for the current terminal session
- approve pending actions
- reject pending actions
- stop the AI session

These controls do not change normal terminal behavior.
