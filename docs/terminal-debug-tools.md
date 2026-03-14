# Terminal Debug Tools

## Overview

Phase 4 adds optional debugging tools to the SerialHub terminal without changing the transport behavior.

The existing terminal path still works the same way:

- raw TCP nodes behave as before
- RFC2217 negotiation behaves as before
- terminal write and script execution paths are unchanged

The new tooling is presentation and observability focused.

## How To Enable

Developer tools are hidden by default.

To open the terminal with debug tools visible, use:

- `/terminal?debug=1`

After that, enable the in-page `Debug tools` toggle.

Until that toggle is enabled:

- protocol trace events are not emitted to the browser
- binary viewers remain hidden
- terminal behavior remains the default text workflow

## Display Modes

When debug tools are enabled, the terminal page exposes three display modes.

### Text

Default mode.

Behavior:

- existing xterm-based terminal rendering
- UTF-8 text presentation
- same user experience as the normal terminal workflow

### Hex

Shows incoming serial payload as hexadecimal byte values.

Use this when:

- the device emits binary data
- control characters are corrupting text readability
- you need to verify exact byte values on the wire

### Mixed

Shows a side-by-side byte-oriented view:

- hex bytes
- printable ASCII preview

Use this when:

- the device emits mostly text with embedded control bytes
- you want human readability without losing byte-level accuracy

## Protocol Trace

The protocol trace panel is optional and only active when debug mode is enabled.

It shows:

- inbound data frames
- outbound terminal writes
- Telnet command frames
- RFC2217 subnegotiation payloads
- transport control/error events

Trace events are emitted as websocket debug messages and do not alter transport behavior.

## Capability Reporting

The terminal debug panel also shows transport capability information reported by the backend.

Examples:

- transport type
- current transport state
- RFC2217 support
- baud control support
- flow control support
- modem signal support
- degraded mode reason, when applicable

This is useful for distinguishing:

- raw TCP passthrough endpoints
- fully negotiated RFC2217 endpoints
- partially supported RFC2217 peers

## Troubleshooting Guidance

### Device output looks garbled

Use:

- `Hex` mode first
- `Mixed` mode second

This helps determine whether the problem is:

- binary device output
- non-printable control bytes
- Telnet/RFC2217 control traffic

### RFC2217 negotiation is suspected

Enable:

- debug mode
- protocol trace panel

Then inspect:

- Telnet command frames
- RFC2217 subnegotiation payloads
- capability/degraded status

### Device works in raw TCP but not RFC2217

Check:

- the selected node `connectionType`
- transport capabilities shown in the panel
- degraded reason, if present
- protocol trace for missing or rejected negotiation frames

## Safety Notes

These tools are intentionally additive:

- they do not change connection logic
- they do not modify negotiation rules
- they do not change write timing
- they do not alter script execution behavior

They exist only to help engineers understand what the working transport is already doing.
