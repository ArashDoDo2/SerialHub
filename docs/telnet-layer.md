# Telnet Layer

## Why It Exists

RFC2217 runs on top of Telnet, not on top of raw TCP bytes alone. That means a serial stream can contain both:

- application payload bytes
- Telnet control sequences such as `IAC DO`, `IAC WILL`, and `IAC SB ... IAC SE`

If the backend forwards those bytes without parsing them, Telnet negotiation traffic leaks into the serial data stream and corrupts terminal output, script logs, and any future RFC2217 command handling.

Phase 2 introduced a dedicated Telnet parsing layer so SerialHub can:

- keep raw data handling binary-safe
- strip Telnet framing from the application data path
- surface negotiation commands separately
- prepare the transport layer for RFC2217 negotiation in Phase 3

## Current Support Status

Current status:

- `RawTcpTransport` remains the production baseline
- transport internals are `Buffer`-based and binary-safe
- Telnet control sequences are parsed and emitted as structured events
- Telnet subnegotiation frames are detected and separated from data
- `Rfc2217Transport` now consumes those parser events to negotiate Telnet and RFC2217 settings cleanly

This means SerialHub now has a shared Telnet framing layer that both transport types can use without duplicating stream parsing logic.

## State Machine

The Telnet parser is streaming and does not assume packet boundaries. It uses these states:

- `DATA`: normal payload bytes
- `IAC`: the previous byte was `IAC` (`255`)
- `COMMAND`: waiting for the Telnet option byte after `DO`, `DONT`, `WILL`, or `WONT`
- `SUBNEGOTIATION`: inside `IAC SB ...`
- `SUBNEGOTIATION_IAC`: inside subnegotiation after an `IAC`, waiting to decide between escaped `IAC` and `SE`

### Supported Sequences

- `IAC IAC`
  - treated as escaped literal `0xFF` in the data stream
- `IAC DO option`
- `IAC DONT option`
- `IAC WILL option`
- `IAC WONT option`
- `IAC SB option ... IAC SE`

### Streaming Behavior

The parser accepts arbitrary `Buffer` chunks. Control frames can begin in one chunk and end in another. The parser keeps state across calls, so all of these are valid:

- `IAC` arriving alone in one packet
- `DO` and its option arriving in later packets
- subnegotiation payload split across multiple packets

## Event Model

The parser emits three event types:

- `data(Buffer)`
  - payload bytes with Telnet framing removed
- `command({ command, option })`
  - Telnet negotiation commands such as `DO` or `WILL`
- `subnegotiation({ option, payload })`
  - Telnet subnegotiation payload without outer `IAC SB` / `IAC SE`

This separation is the key architectural step that keeps transport logic protocol-aware without forcing higher layers to parse Telnet themselves.

## Data Handling

### Binary Safety

The parser and transport layers operate on `Buffer` objects only. They do not decode bytes as UTF-8 internally.

That is intentional:

- raw serial traffic may contain binary bytes
- Telnet control bytes are not text
- RFC2217 negotiation payloads are byte-oriented

### Where Text Decoding Happens

Text decoding is deferred until presentation-oriented paths:

- terminal websocket output
- script log rendering

This keeps the transport layer protocol-safe while preserving the current terminal UI behavior.

## Raw TCP Transport Behavior

`RawTcpTransport` now includes the Telnet parser in its inbound path:

1. TCP socket receives a `Buffer`
2. `TelnetParser` consumes the bytes
3. clean payload bytes are re-emitted as `data`
4. Telnet commands and subnegotiation frames are emitted separately

Outbound writes are unchanged for `RawTcpTransport`:

- writes still go directly to the socket
- no Telnet command generation is performed
- no RFC2217 negotiation is attempted

This preserves the known-good raw TCP path while making the inbound byte stream safe for future protocol extensions.

## How This Enables RFC2217

Phase 3 builds directly on the parser events introduced here:

- `command` events will drive Telnet negotiation policy
- `subnegotiation` events will feed RFC2217 COM-PORT-OPTION handling
- `Rfc2217Transport` reuses the same parser without changing terminal or script call sites

That is why the parser stays deliberately narrow in scope. It owns Telnet framing only. RFC2217 negotiation remains a transport concern layered on top of it.
