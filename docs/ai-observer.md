# AI Observer

## Purpose

The AI observer subsystem is the first AI feature in SerialHub.

Its role is intentionally narrow:

- observe serial output
- receive passive analysis from external AI clients
- store that analysis for human operators

It does **not** participate in device control.

## Safety Model

Human terminal sessions remain the primary control path.

The AI observer is passive by design:

- it only receives `serial.data`
- it receives `session.started` and `session.ended`
- it may send `analysis.result` and `analysis.summary`
- it cannot write to serial ports
- it does not call the terminal write path
- it does not interact with `SerialConnectionManager.write()`

This means AI output can inform the operator, but it cannot affect device behavior.

## Architecture

### Backend components

- `AIObserverService`
  - subscribes to serial output events
  - tracks registered observer sockets
  - forwards passive session/data events
  - stores returned analysis

- `ai_observers`
  - registered passive observer definitions

- `ai_observer_sessions`
  - per-terminal-session observer fanout records

- `ai_observations`
  - stored AI analysis records

### WebSocket flow

Separate namespace:

- `/ai-observers`

SerialHub to AI:

- `serial.data`
- `session.started`
- `session.ended`

AI to SerialHub:

- `analysis.result`
- `analysis.summary`

## Data Flow

Serial device -> SerialHub transport -> `connectionEvents` -> `AIObserverService` -> AI observer socket

AI observer -> `analysis.*` message -> `AIObserverService` -> database -> terminal UI panel

At no point does the AI observer path reconnect into serial writes.

## Registration

Observers are registered through the API and UI with:

- `name`
- `endpoint`
- `authToken`
- `ownerUserId`
- `createdAt`

The auth token is then used by the observer client to connect to `/ai-observers`.

## Terminal UI

The terminal page now includes an optional AI observer panel.

It shows:

- summaries
- warnings
- latest passive AI interpretations for the active node

This panel is informational only and does not change terminal behavior.
