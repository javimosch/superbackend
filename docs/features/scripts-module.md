# Scripts module

## What it is

The Scripts module adds an admin-only interface to configure and execute small operational scripts.

Supported script types:

- `bash` (server host)
- `node` (server host)
- `node` (isolated via `vm2`, best-effort)
- `browser` (runs in the admin UI only)

## Admin UI

- URL: `/admin/scripts`
- Access: protected by admin basic auth.

Capabilities:

- Create/update/delete scripts
- Configure:
  - `name`
  - `codeIdentifier`
  - `description`
  - `type` and `runner`
  - `timeoutMs`
  - `defaultWorkingDirectory`
  - environment variables (`env`)
  - `enabled`
- Execute scripts and view live output.

### Live output streaming

When executing a server-side script, the UI:

1. Calls a run endpoint to start execution.
2. Opens an `EventSource` stream to receive output events.

## Data model

### ScriptDefinition

Mongo collection: `script_definitions`

- `name`
- `codeIdentifier`
- `description`
- `type`: `bash|node|browser`
- `runner`: `host|vm2|browser`
- `script`: script body
- `defaultWorkingDirectory`
- `env`: array of `{ key, value }`
- `timeoutMs`
- `enabled`

### ScriptRun

Mongo collection: `script_runs`

- `scriptId`
- `status`: `queued|running|succeeded|failed|canceled|timed_out`
- `trigger`: `manual|schedule|api`
- `startedAt`, `finishedAt`
- `exitCode`
- `outputTail`: last output bytes for quick preview
- `meta`

## Admin API

All routes below are protected by basic auth.

Script definitions:

- `GET /api/admin/scripts`
- `POST /api/admin/scripts`
- `GET /api/admin/scripts/:id`
- `PUT /api/admin/scripts/:id`
- `DELETE /api/admin/scripts/:id`

Runs:

- `POST /api/admin/scripts/:id/run` -> `{ runId }`
- `GET /api/admin/scripts/runs?scriptId=...`
- `GET /api/admin/scripts/runs/:runId`
- `GET /api/admin/scripts/runs/:runId/stream` (SSE)

## Information

### Calling scripts programmatically

You can execute a server-side script via the Admin API.

- **Start a run**: `POST /api/admin/scripts/:id/run`
- **Stream output**: `GET /api/admin/scripts/runs/:runId/stream` (Server-Sent Events)
- **Fetch final run record**: `GET /api/admin/scripts/runs/:runId`

If a script is **disabled** (`enabled=false`), the server will reject any attempt to run it.

#### Example (start a run)

```bash
curl -u "ADMIN_USER:ADMIN_PASS" \
  -X POST \
  "https://YOUR_HOST/api/admin/scripts/<SCRIPT_ID>/run"
```

Response:

```json
{ "runId": "<RUN_ID>" }
```

#### Example (stream output)

```bash
curl -N -u "ADMIN_USER:ADMIN_PASS" \
  "https://YOUR_HOST/api/admin/scripts/runs/<RUN_ID>/stream"
```

Events are emitted as SSE `event:` frames like `log`, `status`, and `done`.

### Audit

Scripts actions are tracked by the built-in audit system:

- `scripts.create`
- `scripts.update`
- `scripts.delete`
- `scripts.run`

## Runners

### Host runners

- Bash runs using `bash -lc <script>`.
- Node runs using `node -e <script>`.

### vm2 runner (node)

- Executes script body in a restricted `vm2` sandbox.
- No builtin modules are allowed.
- Intended for pure JavaScript utilities.

### Browser runner

- Executes inside the admin page only.
- No server filesystem or server environment access.

## Safety

- Host runners execute on the server, so the module is admin-only.
- `vm2` is best-effort isolation and is treated as a restricted execution mode.
- Output is streamed live; a truncated tail is persisted for quick previews.
