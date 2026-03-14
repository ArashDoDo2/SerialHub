# RFC2217 Implementation Roadmap

## Immediate

- Introduce `connectionType` on nodes with explicit values `raw-tcp` and `rfc2217`
- Stop calling the current socket path "RFC2217" in logs and UI until protocol support exists
- Refactor `SerialConnectionManager` so it manages transport objects instead of raw sockets
- Preserve current raw TCP behavior as `RawTcpTransport`

Status:
- Completed in Phase 1

## Short-Term

- Implement a byte-oriented Telnet parser
- Add RFC2217 negotiation state separate from TCP connect state
- Make terminal and script paths internally buffer-safe
- Update node create/edit UI to make transport type explicit
- Add protocol-aware connection testing in backend

Status:
- Completed in Phases 2 and 3

## Medium-Term

- Implement full `Rfc2217Transport`
- Support COM-PORT-OPTION negotiation
- Apply baud/data bits/parity/stop bits for RFC2217 nodes
- Parse modem state and line state notifications
- Add fallback policy for partial/non-compliant servers

Status:
- `Rfc2217Transport` is implemented
- COM-PORT-OPTION negotiation is implemented
- serial settings and modem/line notifications are implemented
- explicit fallback policy is still pending

## Long-Term

- Add transport capability reporting to UI
- Add binary/hex terminal display mode
- Add recorded protocol traces for troubleshooting
- Add integration tests against real or emulated RFC2217 servers in CI
- Add vendor interoperability profiles if specific devices require deviations

## Safest Execution Order

1. Separate transport abstraction from connection manager
2. Preserve raw TCP as known-good baseline
3. Add Telnet parser with isolated unit tests
4. Add RFC2217 negotiation on top of the parser
5. Wire node transport selection through API and UI
6. Add integration coverage before enabling RFC2217 by default

Progress:
1. Completed
2. Completed
5. Completed for node model/API/UI
3. Completed
4. Completed
6. Partially completed through mocked integration coverage

## Release Strategy

- Release `raw-tcp` as explicit stable mode
- Ship `rfc2217` behind an explicit node-level choice
- Surface negotiation state and degraded capability detail in UI before advertising broad vendor compatibility
- Treat fallback-to-raw as an explicit policy decision, not a silent behavior
