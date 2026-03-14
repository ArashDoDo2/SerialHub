# RFC2217 Audit

## 1. Current State Assessment

### Phase 3 status

Phases 1 through 3 are now implemented:

- nodes have explicit `connectionType`
- raw TCP behavior remains preserved behind `RawTcpTransport`
- Telnet framing is parsed by a shared streaming `TelnetParser`
- `Rfc2217Transport` now performs Telnet option negotiation and RFC2217 COM-PORT-OPTION setup
- terminal and script flows run on top of the transport layer for both `raw-tcp` and `rfc2217` nodes

### Verdict

The backend now supports two distinct modes:

- `raw-tcp`: transparent TCP serial passthrough
- `rfc2217`: Telnet-framed serial transport with RFC2217 negotiation and serial setting application

### What works today

- The backend can open a raw TCP serial transport through `RawTcpTransport` in `packages/backend/src/services/transports/RawTcpTransport.ts`.
- The backend can open an RFC2217 transport through `Rfc2217Transport` in `packages/backend/src/services/transports/Rfc2217Transport.ts`.
- Incoming bytes are forwarded to the browser terminal over Socket.IO.
- Browser keystrokes and script commands are written back to the socket.
- The terminal session lock prevents multiple controlling users on the same node through `TerminalSessionService`.
- Basic reconnect behavior exists while there are subscribers.
- Node-level baud/data bits/parity/stop bits are applied during RFC2217 negotiation.

### What the code is actually doing

The effective pipeline is now:

1. Browser calls `POST /api/terminal/start`
2. `SerialConnectionManager` resolves the node's `connectionType`
3. For `raw-tcp`, backend opens `net.Socket.connect(node.port, node.host)` through `RawTcpTransport`
4. For `rfc2217`, backend opens `Rfc2217Transport`, negotiates Telnet options, and applies serial settings through RFC2217 subnegotiation
5. Incoming payload remains `Buffer` inside the transport/manager path
6. Text is emitted as `terminal:data` only at the websocket presentation boundary
7. Browser input is emitted as text and encoded into `Buffer` before transport write

### What is misleading in UI/DB versus actual protocol support

The remaining places to watch are now narrower. The data model and UI do enforce protocol selection, but operators still need to understand that serial settings are only applied on `rfc2217` nodes:

- `serialNodes` stores `baudRate`, `dataBits`, `parity`, `stopBits` in `packages/backend/src/repositories/SerialNodeRepository.ts`
- Node create/update API accepts those values in `packages/backend/src/routes/nodes.ts`
- Seed data uses typical RFC2217-style TCP serial ports such as `2217`

Current caveat:

- `SerialNodeService.testConnection()` now uses the transport factory, but still returns only coarse `online/offline/error` status rather than detailed capability or degraded-mode detail.

## 2. RFC2217 Protocol Gaps

### Implemented in Phase 3

The backend now implements the core protocol pieces that were previously missing:

- Telnet negotiation with `WILL`, `WONT`, `DO`, and `DONT`
- Telnet framing and subnegotiation parsing through `TelnetParser`
- COM-PORT-OPTION activation on Telnet option `44`
- serial parameter application for baud rate, data size, parity, and stop size
- outgoing `IAC` escaping for RFC2217 application payloads
- incoming de-escaping of `IAC IAC`
- line state and modem state notification parsing
- connection readiness distinct from plain TCP connect success

### Remaining gaps

The remaining RFC2217 work is mostly hardening and breadth, not core protocol bring-up:

- no explicit node-level fallback-to-raw policy yet
- no vendor-specific interoperability profiles
- no UI surface yet for degraded mode, line state, or modem state
- no binary/hex terminal display mode in the frontend
- no real-device interoperability matrix in CI yet

### Scope intentionally not implemented in Phase 3

These capabilities remain out of scope for this phase:

- vendor-specific Telnet quirks
- protocol tracing UI
- richer modem-control UI actions
- operator-facing fallback policy controls

## 3. Risk Assessment

### Devices/servers that should work now

The current implementation is expected to work against:

- raw serial-over-TCP devices when configured as `raw-tcp`
- RFC2217 servers that negotiate `COM-PORT-OPTION`
- servers that acknowledge standard RFC2217 setting commands and notifications

### Devices/servers that may still need hardening

The current implementation may still need follow-up work for:

- partial RFC2217 servers with unusual acknowledgement behavior
- vendor implementations that deviate from common negotiation ordering
- deployments that require explicit fallback-to-raw policy rather than degraded mode
- environments where binary terminal rendering matters operationally

### Current production risks

- partial servers can enter degraded mode, but that degraded state is not yet surfaced in the UI
- logs still favor decoded text for operator workflows rather than preserving a full raw octet transcript
- the test matrix relies on mocked RFC2217 peers rather than multiple real device implementations

## 4. Recommended Architecture

### Required abstraction

The transport boundary has now been introduced for Phase 1.

Recommended interface:

- `SerialTransport`
  - `connect(): Promise<void>`
  - `disconnect(): void`
  - `write(data: Buffer): void`
  - `on('data')`
  - `on('error')`
  - `on('close')`
  - `on('stateChange')`
  - `getState()`
  - `getCapabilities(): TransportCapabilities`

### Concrete transports

- `RawTcpTransport`
  - plain socket passthrough
  - no protocol parsing
  - preserves current behavior
  - implemented in Phase 1

- `Rfc2217Transport`
  - owns Telnet parser
  - performs option negotiation
  - enables COM-PORT-OPTION
  - applies node serial settings to remote server
  - separates control traffic from serial payload
  - implemented in Phase 3

### Parser/state-machine layer

`Rfc2217Transport` should not parse Telnet inline with ad hoc string logic. It needs:

- `TelnetParser`
  - consumes `Buffer`
  - emits payload bytes
  - emits Telnet commands
  - handles `IAC`, `SB`, `SE`, doubled `IAC`

- `Rfc2217Negotiator`
  - tracks option state
  - handles `COM-PORT-OPTION`
  - applies pending serial settings
  - exposes capabilities/ready state

### Capability/fallback model

To support both raw TCP and RFC2217 cleanly:

- add `connectionType` to node model
  - `raw-tcp`
  - `rfc2217`
- optionally add runtime capability info
  - `negotiated`
  - `partial`
  - `fallback-raw`

Do not infer protocol type solely from port number.

## 5. State Machine Design

Recommended transport state model:

- `disconnected`
- `connecting`
- `negotiating`
- `ready`
- `fallback-raw`
- `closing`
- `error`

### Meaning

- `connecting`: TCP socket establishment
- `negotiating`: Telnet/RFC2217 option exchange is active
- `ready`: serial payload path is safe and usable
- `fallback-raw`: RFC2217 endpoint did not negotiate but operator policy allowed transparent raw mode
- `error`: negotiation or transport failed

### Current state handling after Phase 1

Phase 1 manager/transport state handling now distinguishes:

- `disconnected`
- `connecting`
- `connected`
- `error`

This is sufficient for stable raw TCP support, but still insufficient for full RFC2217 because TCP connect success is not protocol readiness.

## 6. Data Handling Design

### Binary-safe transport

Internal transport boundaries should use `Buffer`, not `string`.

Recommended rule:

- socket layer: `Buffer`
- Telnet parser: `Buffer`
- RFC2217 layer: `Buffer`
- script engine write path: encode late, not early
- UI text rendering: decode only at presentation boundary

### Optional text decoding in UI

The browser terminal can still render text, but decoding should be explicit:

- default display mode: UTF-8 text
- optional future display modes: hex / Latin-1 / raw byte view

The backend should not assume terminal data is text.

### Logging strategy for non-text data

Current logging and script capture after Phase 1 are partially improved:

- transport and manager exchange `Buffer`
- script capture decodes at the logging boundary
- terminal websocket path decodes at the presentation boundary

What is still missing:

- raw byte transcript storage
- protocol/control-frame aware logging
- UI modes for non-text payloads

Recommended logging model:

- store raw payload bytes for transport-level audit if needed
- store decoded text separately for UX
- escape/control-mark Telnet negotiation in debug logs
- avoid mixing protocol frames with user-facing terminal transcript

## 7. Implementation Plan

### Phase 1: Transport abstraction

- Extract raw socket behavior from `SerialConnectionManager`
- Introduce `SerialTransport` interface
- Implement `RawTcpTransport` with current semantics
- Add `connectionType` to node model and API
- Status: completed

### Phase 2: Telnet parser

- Add a byte-oriented Telnet parser
- Implement `IAC` handling
- Implement `WILL/WONT/DO/DONT`
- Implement `SB ... SE`
- Keep serial payload separate from Telnet control traffic

### Phase 3: RFC2217 negotiation

- Add `Rfc2217Transport`
- Negotiate Telnet options needed for RFC2217
- Implement `COM-PORT-OPTION`
- Apply stored serial parameters after negotiation
- Handle incoming modem/line status messages

### Phase 4: UI/DB alignment

- Add protocol type to node create/edit UI
- Clarify that serial settings only apply for RFC2217 nodes
- Expose negotiated/fallback transport state in terminal UI
- Update node testing flow to distinguish TCP reachability from RFC2217 readiness

### Phase 5: Test coverage

- transport unit tests
- parser tests with captured byte streams
- integration tests with mock raw TCP and mock RFC2217 servers
- regression tests for script engine and terminal write path

## 8. Test Plan

### Raw TCP endpoint

Validate:

- TCP connect
- byte passthrough
- reconnect
- terminal write/read
- script write path against raw socket

### Partial RFC2217 endpoint

Validate:

- server emits Telnet negotiation but not full COM-PORT support
- client properly negotiates or rejects options
- policy-driven fallback behavior is explicit

### Full RFC2217 endpoint

Validate:

- negotiation reaches `ready`
- baud/data bits/parity/stop bits are applied
- terminal data is clean after Telnet control bytes are stripped
- modem/line state notifications are parsed correctly

### Binary output device

Validate:

- `0x00`
- `0xFF`
- non-UTF-8 payload
- mixed binary/text output

### Negotiation failures

Validate:

- unsupported option response
- malformed `SB/SE`
- timeout during negotiation
- abrupt close during negotiation
- reconnect after negotiation failure

## 9. File-by-File Change Plan

### Existing backend files to modify

- `packages/backend/src/services/SerialConnectionManager.ts`
  - remove protocol-specific assumptions from manager
  - manage transport instances instead of bare sockets

- `packages/backend/src/routes/terminal.ts`
  - report transport readiness more accurately
  - distinguish connect failure from negotiation failure

- `packages/backend/src/services/ScriptService.ts`
  - move toward buffer-safe write path
  - ensure script output logging does not assume UTF-8-only transport data

- `packages/backend/src/services/SerialNodeService.ts`
  - support protocol-aware connection testing

- `packages/backend/src/repositories/SerialNodeRepository.ts`
  - add `connectionType`

- `packages/backend/src/routes/nodes.ts`
  - validate `connectionType`
  - align serial settings semantics with protocol type

- `packages/backend/src/migrations/001_initial_schema.sql`
  - include `connectionType` in fresh schema

- `packages/backend/src/migrations/002_seed_data.sql`
  - seed explicit transport types

- `packages/backend/src/config/logger.ts`
  - add structured transport/protocol context for debugability

- `packages/frontend/src/app/terminal/page.tsx`
  - expose negotiation state and transport type to operator

- `packages/frontend/src/app/nodes/page.tsx`
  - allow selecting protocol type
  - explain RAW vs RFC2217 behavior

### New backend files to add

- `packages/backend/src/services/transports/SerialTransport.ts`
- `packages/backend/src/services/transports/RawTcpTransport.ts`
- `packages/backend/src/services/transports/Rfc2217Transport.ts`
- `packages/backend/src/services/protocols/telnet/TelnetParser.ts`
- `packages/backend/src/services/protocols/telnet/TelnetConstants.ts`
- `packages/backend/src/services/protocols/rfc2217/Rfc2217Negotiator.ts`
- `packages/backend/src/services/protocols/rfc2217/Rfc2217Constants.ts`

### New tests to add

- `packages/backend/tests/telnet-parser.test.*`
- `packages/backend/tests/rfc2217-negotiation.test.*`
- `packages/backend/tests/raw-transport.test.*`
- `packages/backend/tests/rfc2217-transport.test.*`
- `packages/backend/tests/terminal-interop.test.*`

## Bottom Line

SerialHub now has a real RFC2217 transport path instead of silently treating everything as raw TCP. The major architectural pieces are in place:

- protocol-aware transport abstraction
- shared Telnet parser
- RFC2217 negotiation/state machine
- binary-safe data handling
- explicit node transport type
- automated regression coverage for raw TCP and mocked RFC2217 interop

The remaining work is mostly around hardening rather than basic protocol support:

- richer capability reporting to the UI
- optional explicit fallback policy for partial servers
- broader interoperability testing against real device implementations
