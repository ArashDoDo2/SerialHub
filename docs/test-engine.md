# Test Engine

The test engine remains a planned layer on top of the current script engine. The schema primitives exist, but there is not yet a full production test orchestration flow in the backend or frontend.

## What Exists Today

- `deviceProfiles` table
- `testCases` table
- `testRuns` table

These tables are part of the schema and are owner-scoped where applicable, but the main execution and evaluation workflow is still not wired into the product.

## Intended Direction

The likely shape remains:

1. choose a node and device profile
2. run one or more scripts
3. evaluate output against expected and fail conditions
4. persist aggregated pass/fail results
5. produce downloadable reports

## Current Gap

There is no full backend engine yet that:

- schedules test case execution
- evaluates output automatically
- exposes a dedicated test API
- renders a finished test UI in the frontend

For the current automation surface, use scripts and runs rather than treating the test engine as available.
