---
description: Terminals module (admin) to open interactive shell sessions in the browser using xterm.js, backend PTY processes, and WebSocket bridging.
---

# Plan: Admin Terminals module (xterm.js + PTY + WebSocket)

## Goal
Add a new admin module called **Terminals** that allows an admin to open interactive shell sessions directly in the browser.

User workflow target:

- Open multiple terminal tabs.
- Switch between them quickly using keyboard shortcuts.
- Each terminal is a real shell connected to the backend host.

## Decisions (answered)

### Transport
- Use **WebSocket** as the bidirectional transport.
- Messages are JSON frames with small payloads:
  - `input` from browser -> backend
  - `output` from backend -> browser
  - `resize` from browser -> backend
  - `status` + `error` events

### PTY vs non-PTY
- Use a real PTY for correct terminal behavior (line editing, full-screen apps, colors).
- Implementation will use `node-pty`.

### Security
- **Admin only** (basic auth), no public exposure.
- The backend spawns a shell on the server host; this is powerful.
- Terminals are **ephemeral** (in-memory sessions), not persisted.

### Shell + environment
- Default shell: `bash`.
- Default working directory: process cwd.
- Optional per-session `cwd` may be supported but restricted to prevent traversal (MVP: no custom cwd).

### Multi-tab UX + shortcuts
- Terminal tabs rendered in the Terminals page.
- Shortcuts:
  - `Ctrl+Shift+T`: new terminal
  - `Ctrl+Shift+W`: close active terminal
  - `Alt+1..9`: switch to tab
  - `Ctrl+Tab` / `Ctrl+Shift+Tab`: next/prev tab

## Constraints / integration decision

### WebSocket attachment point
Current standalone server uses `app.listen()` in `index.js` and returns `{ app, server }`.

To support WebSockets in both standalone and middleware modes:

- Implement a function `attachTerminalWebsocketServer(server, options)` that attaches a `ws` server to a given HTTP server.
- In standalone mode, call it from `startServer()` after `app.listen()`.
- In middleware mode (mounted into a parent app), the parent must call `attachTerminalWebsocketServer(parentHttpServer, { basePathPrefix })`.

This keeps the terminals feature usable without forcing architectural changes on parent integrations.

## Backend architecture

### In-memory session registry
Create `src/services/terminals.service.js`:

- Maintain a `Map<sessionId, Session>`.
- Each Session holds:
  - `pty` instance
  - `createdAt`, `lastActivityAt`
  - `status`
- Enforce limits:
  - max sessions globally (e.g. 20)
  - idle TTL (e.g. 15 minutes)

### WebSocket server
- Dependency: `ws`.
- WebSocket endpoint (admin-only):
  - `/api/admin/terminals/ws?sessionId=...`

Handshake:
- Session is created via HTTP endpoint first (basic auth).
- The client then connects WS with `sessionId`.

Message protocol:

Client -> server:
- `{ "type": "input", "data": "..." }`
- `{ "type": "resize", "cols": 120, "rows": 30 }`
- `{ "type": "ping" }`

Server -> client:
- `{ "type": "output", "data": "..." }`
- `{ "type": "status", "status": "running"|"closed", "exitCode"?: number }`
- `{ "type": "error", "error": "..." }`

### Admin HTTP API
Add `src/routes/adminTerminals.routes.js` + `src/controllers/adminTerminals.controller.js`:

- `POST /api/admin/terminals/sessions` -> create session `{ sessionId }`
- `GET /api/admin/terminals/sessions` -> list active sessions
- `DELETE /api/admin/terminals/sessions/:sessionId` -> kill session

All protected by `basicAuth`.

## Admin UI

### Navigation
Add new item in `views/partials/dashboard/nav-items.ejs`:

- `{ id: 'terminals', label: 'Terminals', path: adminPath + '/terminals', icon: 'ti-terminal' }`

### Page
Create `views/admin-terminals.ejs`:

- Use xterm.js via CDN:
  - `xterm.css`
  - `xterm.js`
  - optional fit addon via CDN (or implement minimal resize)

UI layout:
- Tab bar (terminal sessions)
- Main terminal area
- Buttons: New, Close

Client flow:
1. `POST /api/admin/terminals/sessions` to create
2. Connect `new WebSocket(baseUrl + '/api/admin/terminals/ws?sessionId=...')`
3. Bind xterm `onData` -> send `input`
4. On `output` -> `term.write(data)`
5. On window resize -> send `resize`

## Server-rendered page route
Add to `src/middleware.js`:

- `GET ${adminPath}/terminals` renders `views/admin-terminals.ejs`.

## Dependencies
- Add `ws` (WebSocket server)
- Add `node-pty` (PTY support)

## Milestones

1. Backend terminal sessions service (pty lifecycle + limits)
2. WebSocket bridge + admin HTTP session endpoints
3. Admin Terminals page (xterm.js) + tabs + shortcuts
4. Docs: `docs/features/terminals-module.md` + plan finalization

## Manual verification checklist
- Open `/admin/terminals`
- Create 2 terminals, run `pwd`, `ls`, `echo hi`
- Switch tabs via shortcuts
- Close a terminal and confirm process is killed
- Confirm idle sessions are cleaned up

## Implementation details (final)

### Files added

- `src/services/terminals.service.js`
- `src/services/terminalsWs.service.js`
- `src/controllers/adminTerminals.controller.js`
- `src/routes/adminTerminals.routes.js`
- `views/admin-terminals.ejs`
- `docs/features/terminals-module.md`

### Admin endpoints

- `POST /api/admin/terminals/sessions`
- `GET /api/admin/terminals/sessions`
- `DELETE /api/admin/terminals/sessions/:sessionId`

### WebSocket

- WS endpoint: `/api/admin/terminals/ws?sessionId=...`
- The WS server is attached in standalone mode by `index.js` after `app.listen()`.
- In middleware mode, the parent app must call `attachTerminalWebsocketServer(parentHttpServer, { basePathPrefix })`.

### Notes

- Sessions are in-memory; restarting the server drops sessions.
- For safety, terminals are admin-only and require Basic Auth.
