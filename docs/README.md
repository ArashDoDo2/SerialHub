# SerialHub Documentation

This documentation set describes the current SerialHub implementation rather than the original generated scaffold.

## Overview

SerialHub is a remote serial operations platform with:

- `raw-tcp` and `rfc2217` transport support
- browser-based terminal access
- script execution and run logs
- SQLite-backed persistence and sessions
- Google OAuth and development-only local auth
- owner-scoped multi-tenant access control
- AI observer, copilot, and automation subsystems

## Recommended Reading Order

1. [getting-started.md](./getting-started.md)
2. [architecture.md](./architecture.md)
3. [authentication.md](./authentication.md)
4. [api-reference.md](./api-reference.md)
5. [serial-nodes.md](./serial-nodes.md)
6. [transport-architecture.md](./transport-architecture.md)
7. [multi-tenant-model.md](./multi-tenant-model.md)
8. [roadmap.md](./roadmap.md)

## Notes

- Some roadmap and audit documents intentionally describe future work or historical findings.
- The AI documentation is split by subsystem:
  - [ai-observer.md](./ai-observer.md)
  - [ai-copilot.md](./ai-copilot.md)
  - [ai-automation.md](./ai-automation.md)
- Roadmap includes both product and engineering items.
