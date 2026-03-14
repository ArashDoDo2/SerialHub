# Multi-Tenant Model

## Overview

SerialHub now scopes major resources to an owning user. Standard users can only see and manage resources where `ownerUserId` matches their authenticated user id. Admins retain read and management access across all tenants.

Serial transport behavior, terminal rendering, and RFC2217/raw transport logic are unchanged. Tenant isolation is enforced above the transport layer.

## Ownership Model

The following resources are owner-scoped:

- `serialNodes.ownerUserId`
- `scripts.ownerUserId`
- `scriptRuns.ownerUserId`
- `deviceProfiles.ownerUserId`
- `ai_observers.ownerUserId`
- AI session tables that already carried `ownerUserId`

For legacy databases, migration `008_multi_tenant_ownership.sql` backfills ownership:

- node ownership is copied from legacy `createdByUserId`
- run ownership is copied from the owning script
- profile ownership is assigned to an existing admin or first available user

## Access Rules

### Nodes

- `GET /api/nodes` returns only the caller's nodes unless the caller is admin
- `GET /api/nodes/:id` requires owner or admin
- `POST /api/nodes` creates a node owned by the caller
- `PUT /api/nodes/:id` requires owner or admin
- `DELETE /api/nodes/:id` requires owner or admin
- `POST /api/nodes/:id/test` requires owner or admin

### Scripts

- script list and detail routes are owner-scoped
- create assigns `ownerUserId = req.user.id`
- update/delete require owner or admin
- script execution requires:
  - owner or admin access to the script
  - owner or admin access to the target node
  - script and node must belong to the same owner

### Runs

- run list is owner-scoped unless admin
- run detail and log download require owner or admin
- run ownership is stored directly on `scriptRuns.ownerUserId`

### Terminal Security

- terminal session start requires owner or admin access to the node
- websocket terminal subscription requires owner or admin access to the node
- terminal writes still require the active controller session to belong to the same user

### AI Security

- AI observers are owner-scoped
- AI observation, copilot, and automation flows may only target nodes owned by the same user as the AI observer
- AI automation approvals and rejections require a user who owns the node or is admin
- AI action/history listing is owner-scoped unless admin

## Admin Overrides

Admins may:

- list and inspect all nodes, scripts, runs, and AI resources exposed by current routes
- update or delete resources across tenants
- approve or reject AI actions on any tenant's node

Admins do not bypass resource consistency checks such as cross-owner script-to-node execution. A script still cannot run against a node owned by a different tenant.

## Repository and Service Layer

Tenant-aware query paths were added to repositories and services so access control does not rely only on route-layer filtering. Examples:

- `SerialNodeRepository.getAllForOwner()`
- `SerialNodeRepository.getByIdForOwner()`
- `ScriptRepository.getAllWithLastRunForOwner()`
- `ScriptRunRepository.listAllDetailedForOwner()`

The intent is to keep tenant filtering close to data access and reduce accidental cross-tenant leakage in future routes or services.

## Safety Notes

- transport implementations remain unchanged
- terminal control remains exclusive per node
- AI agents still do not bypass tool or policy checks
- existing local-auth and admin flows still work, but resource visibility is now user-scoped by default
