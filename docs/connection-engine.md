# Connection Engine

The connection engine maintains live transport instances for remote serial nodes and exposes a clean event stream to the terminal, script engine, and debug tooling.

## Core Class: `SerialConnectionManager`

Location:

- `packages/backend/src/services/SerialConnectionManager.ts`

## Responsibilities

- manage one transport record per node
- open connections on demand
- track subscribers separately from transport objects
- expose transport state changes
- forward inbound data to terminal and script consumers
- close idle connections when no subscribers remain

## Transport Abstraction

The manager no longer owns raw `net.Socket` objects directly. It manages transport implementations:

- `RawTcpTransport`
- `Rfc2217Transport`

Transport creation is delegated through the transport factory.

## Data Path

1. A terminal session or script run requests a node connection
2. The manager opens the correct transport for that node's `connectionType`
3. Inbound bytes are kept as `Buffer`
4. The manager emits connection and data events
5. `app.ts` forwards terminal events to Socket.IO clients

## Current Socket.IO Flow

The terminal page uses explicit events, not room-join events:

- `terminal:subscribe`
- `terminal:unsubscribe`
- `terminal:input`
- `terminal:heartbeat`

Server-side events include:

- `terminal:data`
- `terminal:connected`
- `terminal:disconnected`
- `terminal:error`
- `terminal:capabilities`
- `terminal:trace` when debug tracing is enabled

## Security

- terminal event handlers enforce owner-or-admin access before subscribing or writing
- single-controller terminal sessions are enforced through `TerminalSessionService`
- unsubscribe now verifies the active controlling socket instead of trusting the controller key alone

## Current Transport Support

- `raw-tcp` is the plain TCP baseline
- `rfc2217` uses the Telnet parser and RFC2217 transport implementation

See:

- [transport-architecture.md](./transport-architecture.md)
- [telnet-layer.md](./telnet-layer.md)
- [rfc2217-protocol.md](./rfc2217-protocol.md)

## Operational Notes

- terminal session heartbeats keep active locks alive during idle periods
- stale terminal sessions are reconciled on backend startup after crashes
- startup reconciliation clears stuck active sessions before new terminal work begins
