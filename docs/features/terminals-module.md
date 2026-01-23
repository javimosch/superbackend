# Terminals module

## What it is

The Terminals module provides interactive shell sessions in the admin UI using a WebSocket bridge to backend PTY processes.

- Browser terminal: xterm.js
- Backend shell: PTY (`node-pty`)
- Transport: WebSocket (`ws`)

## Admin UI

- URL: `/admin/terminals`
- Access: protected by admin basic auth.

Capabilities:

- Spawn multiple terminal tabs
- Switch tabs quickly using shortcuts
- Close a terminal (kills the backend PTY)

### Shortcuts

- `Ctrl+Shift+T`: new terminal
- `Ctrl+Shift+W`: close active terminal
- `Ctrl+Tab`: next tab
- `Ctrl+Shift+Tab`: previous tab
- `Alt+1..9`: switch to tab

## Backend

### Session management

- Sessions are in-memory and ephemeral.
- Each session owns a PTY process.
- Idle sessions are cleaned up automatically.

### Admin HTTP API (basic auth)

- `POST /api/admin/terminals/sessions` -> `{ sessionId }`
- `GET /api/admin/terminals/sessions` -> `{ items: [...] }`
- `DELETE /api/admin/terminals/sessions/:sessionId` -> `{ ok: true }`

### WebSocket

- Endpoint: `/api/admin/terminals/ws?sessionId=...`
- Authentication: requires Basic Auth via `Authorization` header.

Message protocol:

Client -> server:

- `{ "type": "input", "data": "..." }`
- `{ "type": "resize", "cols": 120, "rows": 30 }`

Server -> client:

- `{ "type": "output", "data": "..." }`
- `{ "type": "status", "status": "running"|"closed", "sessionId": "..." }`
- `{ "type": "error", "error": "..." }`

## Integration

### Standalone server

The WebSocket server is attached to the HTTP server instance created by `startServer()`.

### Middleware mode

If SuperBackend is mounted as Express middleware in a parent app, the parent app must attach the WebSocket server to its own HTTP server.
