# Frontend Architecture

The frontend is a Next.js App Router application written in TypeScript and styled with Tailwind CSS plus custom UI components.

## Project Structure

```text
packages/frontend/
  src/
    app/
      dashboard/
      login/
      nodes/
      node/[id]/
      terminal/
      scripts/
      script/[id]/
      runs/
      profiles/
      settings/
      agents/
    components/
    lib/
```

## Routing

- App Router file-based routing
- dynamic routes for resource detail pages such as `node/[id]` and `script/[id]`
- shared shell and global styling applied from `src/app/layout.tsx`

## Data Flow

- pages use `fetch` against `/api/*`
- auth state is resolved through `GET /api/auth/me`
- terminal uses Socket.IO for live data and control events

## Terminal Page

`src/app/terminal/page.tsx` is a client component because it depends on:

- Socket.IO client
- xterm.js
- DOM sizing
- local interactive state

Current terminal features include:

- connect and disconnect controls
- line ending selection
- optional debug mode via `/terminal?debug=1`
- protocol trace viewer
- transport capability panel
- AI copilot panel
- AI automation approval panel

## Node UI

- `/nodes` lists nodes, supports create, edit, delete, and live status checks
- `/node/[id]` shows detail and settings
- node pages support choosing `raw-tcp` or `rfc2217`
- AI agent assignment in node settings is currently frontend-managed state

## Agents UI

- `/agents` lists the current user's AI observer records
- users can create and delete agents from the frontend
- the frontend uses `/api/ai-observers` for the persisted agent list

## Dashboard

The dashboard now distinguishes between:

- total configured nodes
- live reachable nodes based on connection probes

`total nodes` is rendered as soon as node data loads, while `active nodes` shows `Checking...` until probe results return.

## Build Notes

- standard build: `next build`
- the terminal page is intentionally client-rendered because of xterm.js and sockets
