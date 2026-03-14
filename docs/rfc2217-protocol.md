# RFC2217 Protocol

## Overview

SerialHub now supports two transport modes:

- `raw-tcp`
- `rfc2217`

`rfc2217` is implemented as a dedicated transport on top of the shared Telnet parser. It does not change `RawTcpTransport` behavior.

Relevant files:

- `packages/backend/src/services/transports/Rfc2217Transport.ts`
- `packages/backend/src/services/protocols/telnet/TelnetParser.ts`
- `packages/backend/src/services/protocols/rfc2217/Rfc2217Negotiator.ts`
- `packages/backend/src/services/protocols/rfc2217/Rfc2217Constants.ts`

## Telnet Negotiation

RFC2217 runs over the Telnet option `COM-PORT-OPTION` (`44`).

On connect, `Rfc2217Transport` performs Telnet negotiation for:

- `BINARY` (`0`)
- `SUPPRESS-GO-AHEAD` (`3`)
- `COM-PORT-OPTION` (`44`)

The transport sends both directions for each negotiated option:

- `IAC WILL <option>`
- `IAC DO <option>`

This allows:

- local transmit path to be treated as binary-safe
- remote transmit path to be treated as binary-safe
- RFC2217 subnegotiation to become active

Unsupported Telnet options are rejected explicitly with:

- `WONT` for unsupported `DO`
- `DONT` for unsupported `WILL`

## Connection State Machine

`Rfc2217Transport` uses these states:

- `disconnected`
- `connecting`
- `telnet-negotiating`
- `rfc2217-negotiating`
- `ready`
- `error`

Meaning:

- `connecting`: TCP handshake in progress
- `telnet-negotiating`: Telnet options are being established
- `rfc2217-negotiating`: COM-PORT-OPTION is active and serial settings are being applied
- `ready`: transport is usable for terminal/script writes

`SerialConnectionManager.write()` now permits writes only when the transport is:

- `connected` for raw TCP
- `ready` for RFC2217

## COM-PORT-OPTION Commands

SerialHub currently uses these RFC2217 commands during connect:

- `SET-BAUDRATE`
- `SET-DATASIZE`
- `SET-PARITY`
- `SET-STOPSIZE`
- `SET-CONTROL`
- `SET-LINESTATE-MASK`
- `SET-MODEMSTATE-MASK`

The source of truth is the node record:

- `baudRate`
- `dataBits`
- `parity`
- `stopBits`

Those values are encoded and sent as Telnet subnegotiation:

`IAC SB COM-PORT-OPTION <command> <payload> IAC SE`

The transport expects server acknowledgements using the RFC2217 server command offset (`+100`), for example:

- `SET-BAUDRATE` -> `SERVER-SET-BAUDRATE`
- `SET-PARITY` -> `SERVER-SET-PARITY`

## Notification Handling

The transport parses and surfaces:

- `NOTIFY-LINESTATE`
- `NOTIFY-MODEMSTATE`

These are emitted from the transport as structured events and forwarded by `SerialConnectionManager` for future UI use.

Current use:

- backend logging
- transport capability reporting

Not implemented yet:

- dedicated UI indicators for line/modem state

## Binary Safety

All transport internals stay `Buffer`-based.

Important rules:

- Telnet framing is parsed before payload is emitted upstream
- incoming `IAC IAC` is decoded back to literal `0xFF`
- outgoing RFC2217 application data escapes `0xFF` as `IAC IAC`
- text decoding only happens at terminal/log presentation boundaries

This keeps:

- binary serial payloads intact
- Telnet control bytes out of the terminal transcript
- RFC2217 negotiation out of the application data path

## Capability and Degraded Mode

`Rfc2217Transport` reports capability metadata through `getCapabilities()`.

Current fields include:

- `supportsTelnet`
- `supportsRfc2217`
- `supportsLineStateNotifications`
- `supportsModemStateNotifications`
- `degraded`
- `degradedReason`

Degraded mode is used when:

- optional Telnet options are rejected
- optional RFC2217 requests are not acknowledged

Hard failures occur when:

- `COM-PORT-OPTION` cannot be negotiated
- required serial setting acknowledgements do not arrive or are invalid

## Architecture Boundary

The key design rule remains:

- `TelnetParser` owns framing
- `Rfc2217Negotiator` owns negotiation and COM-PORT-OPTION policy
- `Rfc2217Transport` owns socket lifecycle and transport readiness
- `SerialConnectionManager` owns node-level orchestration and reconnect behavior

This keeps the protocol logic modular and allows raw TCP and RFC2217 to coexist cleanly.
