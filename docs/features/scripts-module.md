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
