# Serial Nodes

A serial node represents one remote serial endpoint that SerialHub can reach over the network.

## Supported Connection Types

Nodes currently support:

- `raw-tcp`
- `rfc2217`

`raw-tcp` keeps a plain TCP byte stream.

`rfc2217` uses the RFC2217 transport on top of Telnet framing and negotiation.

## Data Model

Key fields on `serialNodes`:

- `id`
- `name`
- `description`
- `connectionType`
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

See [database-schema.md](./database-schema.md) for the table definition.

## API Endpoints

- `GET /api/nodes`
- `POST /api/nodes`
- `GET /api/nodes/:id`
- `PUT /api/nodes/:id`
- `DELETE /api/nodes/:id`
- `POST /api/nodes/:id/test`

Request validation is implemented with Zod in `packages/backend/src/routes/nodes.ts`.

## Access Control

- normal users only see and manage their own nodes
- admins can see and manage all nodes
- terminal access and script execution re-check node ownership before opening a session

## Live Status

There are two distinct status concepts:

- `isActive`: configuration flag that marks a node as enabled
- live reachability: result of `POST /api/nodes/:id/test`

The frontend dashboard and node pages use the live test result to show whether a node appears reachable.

## Connection Lifecycle

- connections are opened on demand by `SerialConnectionManager`
- terminal sessions are single-controller per node
- stale active terminal sessions are reconciled on backend startup after crashes
- terminal sessions use heartbeats to avoid losing the controller lock during an otherwise healthy idle session

## Frontend

The frontend includes:

- `/nodes` for list, create, edit, delete, and live probe status
- `/node/[id]` for detail and node settings

The node UI also lets the user choose the transport mode and test reachability.
