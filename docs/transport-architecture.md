# Transport Architecture

## Why the transport abstraction was introduced

SerialHub originally treated every serial endpoint as a direct `net.Socket` connection managed inside `SerialConnectionManager`. That worked for raw TCP passthrough, but it coupled:

- socket lifecycle
- reconnect behavior
- subscriber tracking
- terminal/script integration
- protocol assumptions

Phase 1 introduced that transport boundary so protocol-specific logic can evolve without rewriting the terminal and script layers.

## Current support status

Current transport support:

- `raw-tcp`: implemented and production baseline for the current codebase
- `rfc2217`: implemented as a separate Telnet/RFC2217 transport

Both transport types are now selected explicitly from the node record through `connectionType`.

## Current transport structure

### `SerialTransport`

Location:
- `packages/backend/src/services/transports/SerialTransport.ts`

Responsibility:
- expose a small typed lifecycle contract
- emit binary-safe payloads as `Buffer`
- expose state changes and capabilities

Key methods:

- `connect()`
- `disconnect()`
- `write(data: Buffer)`
- `getState()`
- `getCapabilities()`

### `RawTcpTransport`

Location:
- `packages/backend/src/services/transports/RawTcpTransport.ts`

Behavior:

- opens a plain TCP socket
- keeps payloads as `Buffer` internally
- emits socket data without decoding
- reports `disconnected`, `connecting`, `connected`, `error`
- preserves the existing raw serial-over-TCP baseline

This transport does not:

- negotiate Telnet options
- parse control frames
- apply RFC2217 serial settings

### `Rfc2217Transport`

Location:
- `packages/backend/src/services/transports/Rfc2217Transport.ts`

Behavior:

- opens a TCP socket and attaches the shared `TelnetParser`
- performs Telnet option negotiation for `BINARY`, `SUPPRESS-GO-AHEAD`, and `COM-PORT-OPTION`
- applies baud rate, data size, parity, stop size, and control settings through RFC2217 subnegotiation
- emits a clean serial payload stream after Telnet framing is removed
- reports richer states such as `telnet-negotiating`, `rfc2217-negotiating`, and `ready`
- escapes outgoing `0xFF` bytes correctly for Telnet-framed data streams

Supporting pieces:

- `packages/backend/src/services/protocols/telnet/TelnetParser.ts`
- `packages/backend/src/services/protocols/rfc2217/Rfc2217Negotiator.ts`
- `packages/backend/src/services/protocols/rfc2217/Rfc2217Constants.ts`

## Connection manager role after Phase 1

Location:
- `packages/backend/src/services/SerialConnectionManager.ts`

The manager now:

- resolves node `connectionType`
- creates a transport instance
- tracks connection state per node
- handles reconnect policy
- exposes binary-safe connection events
- keeps subscriber bookkeeping separate from transport objects

The manager no longer depends on raw socket internals directly.

## Terminal and script integration

Terminal and script paths now sit above the transport layer:

- terminal UI still receives text, but decoding happens at the websocket boundary
- script execution still writes text commands, but transport writes are buffer-based internally
- connection events carry `Buffer` until the presentation/logging edge

This keeps current behavior stable while allowing RFC2217-specific logic to live in its own transport.

## Design boundary going forward

The key rule for future work is:

- transport layer handles bytes and protocol
- manager handles connection orchestration
- terminal/script/UI layers should not care whether the node is raw TCP or RFC2217

That keeps raw TCP stable while RFC2217 support is added incrementally and safely.
