# Security Findings Checklist

## Critical

- [ ] `LOCAL_AUTH_ENABLED` auto-attaches the local master user to unauthenticated API requests and websocket handshakes in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts), [auth.ts](/c:/dev/SerialHub/packages/backend/src/middleware/auth.ts), and [env.ts](/c:/dev/SerialHub/packages/backend/src/config/env.ts).
- [ ] Local auth is presented as a login flow but still silently authenticates requests even without `/api/auth/login` in [auth.ts](/c:/dev/SerialHub/packages/backend/src/routes/auth.ts) and [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts).

## High

- [ ] `terminal:unsubscribe` can release an active controller session based only on `controllerKey`, without verifying session ownership, in [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts).
- [ ] Pending AI automation actions can still be approved and executed after the AI session has been stopped in [AIAutomationService.ts](/c:/dev/SerialHub/packages/backend/src/services/AIAutomationService.ts).

## Medium

- [ ] Terminal control still depends on a client-generated `controllerKey` rather than a server-issued lease token in [terminal.ts](/c:/dev/SerialHub/packages/backend/src/routes/terminal.ts) and [TerminalSessionService.ts](/c:/dev/SerialHub/packages/backend/src/services/TerminalSessionService.ts).
- [ ] Terminal attach flow is split across HTTP start + websocket subscribe/input and remains stateful enough to be brittle under reconnect/race conditions in [terminal.ts](/c:/dev/SerialHub/packages/backend/src/routes/terminal.ts) and [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts).
- [ ] AI observer auth tokens are static bearer secrets stored in plaintext and accepted directly in websocket handshakes in [AIObserverRepository.ts](/c:/dev/SerialHub/packages/backend/src/repositories/AIObserverRepository.ts) and [app.ts](/c:/dev/SerialHub/packages/backend/src/app.ts).
- [ ] AI rate limiting is process-local and resets on restart in [PolicyEngine.ts](/c:/dev/SerialHub/packages/backend/src/services/PolicyEngine.ts).

## Low

- [ ] Run log download trusts `outputFilePath` from the database instead of constraining reads to a log root in [runs.ts](/c:/dev/SerialHub/packages/backend/src/routes/runs.ts).
- [ ] Ownership backfill for legacy `deviceProfiles` and `testRuns` is heuristic and may assign incorrect owners for future APIs in [migrations.ts](/c:/dev/SerialHub/packages/backend/src/config/migrations.ts).
- [ ] AI audit records do not capture whether the related automation session was still active at execution time in [AIAutomationService.ts](/c:/dev/SerialHub/packages/backend/src/services/AIAutomationService.ts) and [AIToolActionRepository.ts](/c:/dev/SerialHub/packages/backend/src/repositories/AIToolActionRepository.ts).
