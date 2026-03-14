# AI Copilot

## Purpose

The AI Copilot is a passive guidance layer for SerialHub. It can observe serial output, build hypotheses, and suggest possible commands or scripts for a human operator to consider.

It does not execute commands, run scripts, or write to serial ports.

## Safety Model

- Human terminal control remains the only execution path.
- Copilot suggestions are advisory only.
- Suggested serial commands can be copied into the terminal input, but they are never sent automatically.
- Suggested scripts can be opened by the user, but they are never started automatically.
- Copilot integrations only have access to read-only tools.

## Architecture

Serial output is forwarded from the existing connection event stream into `AICopilotService`.

`AICopilotService` is responsible for:

- tracking active copilot sessions for terminal sessions
- forwarding passive serial output to connected copilot clients
- serving read-only context tools
- storing suggestion history
- emitting stored suggestions back to the terminal UI

The service uses the existing `ai_observers` registration and auth token model, but runs on its own Socket.IO namespace:

- `/ai-copilot`

## Message Flow

SerialHub to copilot:

- `session.started`
- `serial.data`
- `session.ended`

Copilot to SerialHub:

- `copilot.suggestion`
- `copilot.summary`
- `tool.call`

SerialHub responses:

- `copilot.ack`
- `copilot.error`
- `tool.result`

## Suggestion Shape

Suggestions are structured and stored for later review.

Example:

```json
{
  "summary": "Device may be stuck in bootloader mode.",
  "hypotheses": [
    { "label": "bootloader_stuck", "confidence": 0.83 }
  ],
  "suggestedActions": [
    {
      "type": "serial_command",
      "command": "reboot",
      "reason": "Device appears idle in bootloader"
    },
    {
      "type": "script",
      "scriptId": 12,
      "scriptName": "Bootloader Recovery",
      "reason": "Known recovery path for this device family"
    }
  ]
}
```

## Read-Only Tools

Copilot clients can request limited context using `tool.call`.

Allowed tools:

- `terminal.snapshot`
- `node.info`
- `script.list`

These tools are read-only and do not expose any execution path.

## UI Behavior

The terminal page shows a dedicated AI Copilot panel.

- Suggestions are displayed as optional guidance.
- Serial command suggestions can prefill the terminal input box.
- Script suggestions can open the scripts page.
- Users can ignore suggestions without affecting the session.

## Persistence

Suggestion history is stored in:

- `ai_copilot_sessions`
- `ai_copilot_suggestions`

This history is scoped by node and observer owner and can be queried by the terminal UI.
