---
description: Scripts module (admin) to configure and run Bash / Node / Browser scripts with optional isolation, SSE output streaming, and optional scheduling/API triggers.
---

# Plan: Admin Scripts module (Bash / Node / Browser) with SSE streaming

## Goal
Add a new admin module called **Scripts** (visible in the admin dashboard sidebar/nav) that lets an admin:

- Create/edit scripts (Bash and Node.js initially; Browser scripts as a UI-only runner).
- Run scripts manually from the UI and see **streamed output** (stdout/stderr) via **SSE**.
- Optionally schedule scripts (cron) and optionally expose scripts via an API trigger.

Immediate target use-case:

Run a script that calls the repo CLI to update SSH keys + sync a project:

```bash
node scripts/cli.js update-project 6972568e8c2158906bcd94ee \
  --token "YOUR_JWT_TOKEN" \
  --org-id "69723fadea6151ce7f7a902f" \
  --private-key-file ~/.ssh/id_rsa

node scripts/cli.js sync-project 6972568e8c2158906bcd94ee \
  --token "YOUR_JWT_TOKEN" \
  --org-id "69723fadea6151ce7f7a902f"
```

## Non-goals (for first iteration)
- Multi-tenant permissions / per-org RBAC (keep admin-only).
- Remote runners / distributed execution.
- Perfect sandboxing for Bash (not feasible in-process without containers).

## Decisions (answered)

### Script types
- **bash**: executed via host shell using `child_process.spawn`.
- **node**:
  - **host mode**: executed via `node` process (spawn) for full compatibility.
  - **isolated mode**: executed via `vm2` (limited, best-effort). Note: vm2 cannot support arbitrary native modules/`child_process` safely; it’s meant for pure JS.
- **browser**:
  - executed in the admin UI only (sandboxed iframe) with an explicit limited API surface.
  - cannot access server filesystem/secrets; intended for utility snippets (formatting, diffing, etc.).

### Isolation
- `bash`:
  - **non-isolated only** (host). We expose a prominent warning.
- `node`:
  - supports `host` and `vm2`.
- Isolation is configured per script.

### Secrets
- For MVP: scripts can use:
  - literal script text (stored in DB)
  - optional environment variables configured per script (stored in DB)
- No external secret manager in this iteration.
- UI warns that stored env vars are sensitive.

### Scheduling / API triggers
- Marked **optional**.
- Plan includes:
  - Minimal scheduling support using `node-cron` (or similar) gated behind `enabled` flag.
  - Optional API trigger using a per-script secret token stored hashed.

## Data model

### `ScriptDefinition`
New mongoose model in `src/models/ScriptDefinition.js`:

- `name` (string, required)
- `codeIdentifier` (string, required, unique, normalized; used in URLs)
- `description` (string)
- `type` enum: `bash | node | browser`
- `runner` enum:
  - for bash: `host`
  - for node: `host | vm2`
  - for browser: `browser`
- `script` (string, required) — script body
- `defaultWorkingDirectory` (string, optional) — server-side only
- `env` (array of `{ key, value }`, optional)
- `timeoutMs` (number, default e.g. 5m)
- `enabled` (boolean)

Optional fields for later:
- `schedule`:
  - `enabled` (boolean)
  - `cron` (string)
  - `timezone` (string)
- `apiTrigger`:
  - `enabled` (boolean)
  - `tokenHash` (string)

### `ScriptRun`
New mongoose model in `src/models/ScriptRun.js`:

- `scriptId` (ObjectId ref ScriptDefinition)
- `status` enum: `queued | running | succeeded | failed | canceled | timed_out`
- `startedAt`, `finishedAt`
- `exitCode` (number)
- `trigger` enum: `manual | schedule | api`
- `meta` (object: who triggered, request info)
- `outputTail` (string) — last N bytes for quick UI preview

## Execution runtime

New service: `src/services/scriptsRunner.service.js`

Responsibilities:
- Start a run from a ScriptDefinition.
- Enforce `timeoutMs` and single-run concurrency policy.
- Stream output events (stdout/stderr) to listeners.
- Persist run status + output tail.

### Bash (host)
Use `child_process.spawn`:
- command: `bash`
- args: `['-lc', scriptText]`
- env: merge of `process.env` + script env overrides
- cwd: `defaultWorkingDirectory` or server process cwd

### Node (host)
Prefer spawn for maximum compatibility:
- command: `node`
- args: `['-e', scriptText]` (or write temp file; prefer temp file if script is large)
- env/cwd same as above

### Node (vm2)
Use `vm2` to execute pure JS with restricted builtins:
- no `require` by default (or allowlist basic modules only)
- disallow `child_process`
- hard timeout

Practical note: the immediate goal script is better served by **bash** (host) or **node host spawn**.

## Streaming output via SSE

### Approach
Implement an in-memory event bus per run (EventEmitter + ring buffer) and expose:

- Start run returns `runId`
- UI opens `EventSource` to `/api/admin/scripts/runs/:runId/stream`

SSE events:
- `event: log` with `{ stream: 'stdout'|'stderr', line, ts }`
- `event: status` with `{ status, exitCode?, ts }`
- `event: done` when finished

Server details:
- Proper SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, keep-alive)
- Heartbeat `: ping\n\n` every ~15s
- On reconnect, client can pass `?since=<seq>` to resume from ring buffer best-effort

## API design

### Admin (basic auth)
New routes file: `src/routes/adminScripts.routes.js`
New controller: `src/controllers/adminScripts.controller.js`

Endpoints:
- `GET /api/admin/scripts` list definitions
- `POST /api/admin/scripts` create
- `GET /api/admin/scripts/:id` get
- `PUT /api/admin/scripts/:id` update
- `DELETE /api/admin/scripts/:id` delete

Execution:
- `POST /api/admin/scripts/:id/run` -> `{ runId }`
- `GET /api/admin/scripts/runs/:runId` -> run status snapshot
- `GET /api/admin/scripts/runs/:runId/stream` -> SSE
- `GET /api/admin/scripts/runs?scriptId=...` -> recent runs

### Optional public trigger (later)
- `POST /api/scripts/:codeIdentifier/run` with `Authorization: Bearer <token>`

## Admin UI

### Navigation
Add a new item in `views/partials/dashboard/nav-items.ejs`:

- Section: `Automation` (or `System & DevOps`)
- Item: `{ id: 'scripts', label: 'Scripts', path: adminPath + '/scripts', icon: 'ti-terminal-2' }`

### Page
Add a new view: `views/admin-scripts.ejs`

UI features (MVP):
- List scripts + create/edit form
- Script editor (textarea) + env vars grid
- Runner selection:
  - bash host
  - node host
  - node vm2
  - browser
- Run button
- Live output panel (monospace) driven by SSE
- Run history list

Browser script execution:
- For browser scripts, run happens in the page (no backend). Output panel shows console output captured.

## Routing / mounting

- Add a server-rendered route similar to the existing dashboard routes in `src/middleware.js`:
  - `GET ${adminPath}/scripts` (basic auth) -> render `views/admin-scripts.ejs`
- Mount admin API routes:
  - `router.use('/api/admin/scripts', require('./routes/adminScripts.routes'))`

## Safety constraints
- All admin endpoints behind `basicAuth`.
- Bash host mode is inherently powerful; UI shows warning.
- Node host mode can access server; UI shows warning.
- vm2 mode is best-effort; we keep it strict and minimal.
- Store only last N bytes of logs in DB; full log is streamed live and can optionally be downloaded.

## Milestones

1. Backend foundation
   - Models: ScriptDefinition, ScriptRun
   - Runner service (bash host, node host, node vm2)
   - SSE streaming infra

2. Admin APIs
   - CRUD scripts
   - Run + status + SSE stream

3. Admin UI
   - Add nav item
   - Add Scripts page with editor + run + streamed output

4. Optional extras (if time)
   - Cron scheduling
   - Public/protected API trigger

## Manual verification checklist
- Create a Bash script that runs the provided CLI commands.
- Run it manually and see streamed output in the UI.
- Confirm exit code + run status are saved.
- Confirm node host runner works with `node scripts/cli.js ...`.
- Confirm vm2 runner executes a simple pure JS script but blocks `require('child_process')`.

## Implementation details (final)

### Files added

- `src/models/ScriptDefinition.js`
- `src/models/ScriptRun.js`
- `src/services/scriptsRunner.service.js`
- `src/controllers/adminScripts.controller.js`
- `src/routes/adminScripts.routes.js`
- `views/admin-scripts.ejs`
- `docs/features/scripts-module.md`

### Server wiring

- Admin page route:
  - `GET ${adminPath}/scripts` renders `views/admin-scripts.ejs` (basic auth)
- Admin APIs mounted:
  - `/api/admin/scripts` -> `src/routes/adminScripts.routes.js` (basic auth)

### SSE streaming

- SSE endpoint: `GET /api/admin/scripts/runs/:runId/stream`
- Events:
  - `log` (stdout/stderr chunks)
  - `status`
  - `done`
- In-memory run bus:
  - Active runs are streamable live.
  - After completion, runs may no longer be available for live streaming; the API falls back to returning `outputTail` + final status.

### Known limitations

- Host runners execute on the server host (powerful). Module is admin-only.
- `vm2` is best-effort and intended for pure JS utilities.
- Browser scripts run only in the admin page (not persisted as server-side runs).
