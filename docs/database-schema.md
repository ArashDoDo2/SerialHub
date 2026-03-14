# Database Schema

SerialHub uses SQLite by default. The database file is controlled by `DATABASE_PATH` and defaults to `./data/serialhub.db`.

This page is a practical summary of the current schema shape. The source of truth remains the migration files in `packages/backend/src/migrations`.

## Core Tables

### users

Stores authenticated users.

Key fields:

- `id`
- `googleId`
- `email`
- `name`
- `avatarUrl`
- `role` in `('admin', 'user')`
- `createdAt`
- `updatedAt`

### deviceProfiles

Profiles are owner-scoped.

Key fields:

- `id`
- `name`
- `description`
- `defaultBaudRate`
- `notes`
- `ownerUserId`
- `createdAt`
- `updatedAt`

### serialNodes

Nodes are owner-scoped and transport-aware.

Key fields:

- `id`
- `name`
- `description`
- `connectionType` in `('raw-tcp', 'rfc2217')`
- `host`
- `port`
- `baudRate`
- `dataBits`
- `parity`
- `stopBits`
- `isActive`
- `ownerUserId`
- `createdAt`
- `updatedAt`

### scripts

Scripts are owner-scoped.

Key fields:

- `id`
- `name`
- `description`
- `commandsJson`
- `defaultDelayMs`
- `timeoutMs`
- `ownerUserId`
- `createdAt`
- `updatedAt`

### scriptRuns

Runs are owner-scoped and linked to a script, node, and initiating user.

Key fields:

- `id`
- `scriptId`
- `nodeId`
- `runByUserId`
- `ownerUserId`
- `startedAt`
- `finishedAt`
- `status`
- `outputFilePath`

### terminalSessions

Interactive terminal sessions are persisted and are not just an in-memory concept.

Base schema fields:

- `id`
- `nodeId`
- `userId`
- `startedAt`
- `finishedAt`
- `logFilePath`
- `status`

Runtime migration additions also include:

- `controllerKey`
- `heartbeatAt`
- `controllingSocketId`

These support single-controller enforcement, websocket rebinding, idle heartbeats, and crash recovery.

### testCases

Defines test expectations linked to scripts.

### testRuns

Test runs are owner-scoped.

Key fields:

- `id`
- `nodeId`
- `deviceProfileId`
- `runByUserId`
- `ownerUserId`
- `startedAt`
- `finishedAt`
- `overallResult`
- `reportFilePath`

## AI Tables

The AI subsystem adds several owner-scoped tables through later migrations.

### ai_observers

- observer registration records
- includes `authToken` and `ownerUserId`

### ai_observer_sessions

- observer websocket sessions linked to node and terminal session context

### ai_observations

- stored observer analysis results per node

### ai_copilot_sessions

- copilot websocket sessions linked to terminal sessions

### ai_copilot_suggestions

- stored AI summaries, hypotheses, and suggested actions

### ai_automation_sessions

- active automation sessions per terminal session

### ai_tool_actions

- proposed and executed tool actions with audit history

## Ownership Model

Owner scoping is central to the schema:

- `serialNodes.ownerUserId`
- `deviceProfiles.ownerUserId`
- `scripts.ownerUserId`
- `scriptRuns.ownerUserId`
- `testRuns.ownerUserId`
- AI tables also carry owner context

Admins can access all rows through application-layer authorization, but the stored ownership model remains per resource.

## Indexes

Important indexes include:

- user lookup indexes on `googleId` and `email`
- owner indexes on major tenant-scoped tables
- `serialNodes(host, port)`
- `serialNodes(connectionType)`
- run status indexes

## Data Lifecycle

- migrations run on backend startup
- repair migrations also backfill ownership and missing columns for older databases
- seed data is added by `002_seed_data.sql`
- terminal crash recovery reconciles stale active sessions on startup
