# Plan: Script return values + separate Output vs Console

## Goal
Add first-class **return value** support for scripts (especially `node/host` and `node/vm2`), while preserving the existing behavior where **console output is streamed live**.

Admin UI requirements:

- **Output** panel:
  - Shows the *returned value* when `return` is used, otherwise
  - Shows the final parsed value (current behavior: parse a valid JSON line / best-effort)
- **Console** panel:
  - Shows any `stdout`/`stderr` produced during execution (`console.log`, errors, etc.)

Programmatic callers (API / WS) must be able to capture:

- The return value (if any)
- The streamed console logs

## Current State (as-is)

### Data model
`ScriptRun` (`src/models/ScriptRun.js`):

- `outputTail`: a single string tail built by appending all streamed logs
- No dedicated field for a return value

### Execution + streaming
`src/services/scriptsRunner.service.js`:

- `RunBus` emits events:
  - `log` with `{ stream: 'stdout'|'stderr', line }`
  - `status`, `done`
- For spawned processes (bash), logs are captured from stdio.
- For `node/host` (DB mode) and `node/vm2`, logs are captured via `vm.on('console.log'...)`.

`src/controllers/adminScripts.controller.js`:

- SSE `/api/admin/scripts/runs/:runId/stream` forwards bus events.
- Fallback when no bus: emits `log` with `run.outputTail` as a single `stdout` blob.

### Admin UI
`views/admin-scripts.ejs`:

- Has a single output area.
- `EventSource` handler appends every `log` event into that same buffer.

## Proposed Design

### 1. Return value capture (node runners)

#### Key idea
Wrap the user script in a function so that a **return value can be captured**, without changing how console logs are streamed.

We already have an async wrapper for `await`. We’ll extend this wrapper so we can also capture a return.

#### Wrapper contract
When `SCRIPT_RETURN_VALUE_ENABLED=true` (new env toggle; default TBD), we execute **prepared code** that:

- Runs user code inside an async function
- Captures the function’s returned value (including `undefined`)
- Emits a *dedicated* bus event (new) containing a serialized return value

Pseudo-wrapper (conceptual):

```js
(async () => {
  const __result = await (async () => {
    // user code here
  })();
  // emit __result
})();
```

#### How to detect `return`
We should support explicit `return` statements, but the wrapping can be unconditional (for node runners) to avoid brittle parsing.

Options:

- **Option A (recommended): always wrap** node scripts in an async function and capture its return.
  - Pros: simplest, consistent, supports both sync and async returns.
  - Cons: changes scoping slightly (top-level `var/let/const` become function-scoped).
- **Option B: detect `return`** and only wrap when `return` exists.
  - Pros: less behavioral change.
  - Cons: detection is error-prone (strings/comments), and users with `await` already get wrapped.

Recommendation: **Option A**, but apply it only to `node/host` + `node/vm2` runners (not bash). Keep `browser` runner separate.

#### Serialization format
Return values must be JSON-safe.

- If return value is JSON-serializable: `JSON.stringify(value)`
- If serialization fails (circular): send `{ type: 'error', message: 'Non-serializable return value' }` and still keep console.

We should store return value on `ScriptRun` so `GET /runs/:runId` can return it.

### 2. Data model changes

Add fields to `ScriptRun`:

- `result`: `Mixed` (or `String`) – canonical return value payload
- `resultFormat`: `string|json` (optional)

Also split tails:

- `consoleTail`: tail of console output (stdout+stderr merged or separate)
- (optional) `stdoutTail`, `stderrTail` if we want exact separation

Backwards compatibility:

- Keep `outputTail` for existing UI/clients.
- Populate `outputTail` as today (merged console), but new UI will prefer `consoleTail`.

### 3. SSE / API contract changes

Introduce a **new SSE event type**:

- `event: result`
- data:
  - `{ seq, type: 'result', ts, value, format }`

Continue existing events:

- `log` events continue to stream console
- `status`, `done` unchanged

Fallback SSE (no in-memory bus):

- If `run.result` exists, emit `result` once
- Then emit `log` with `consoleTail` or `outputTail`

Programmatic caller:

- `POST /api/admin/scripts/:id/run` could optionally return `{ runId, streamUrl }`
- `GET /api/admin/scripts/runs/:runId` must include `result` + `consoleTail` for non-SSE clients.

### 4. Admin UI split panels

Update `views/admin-scripts.ejs`:

- Add two UI areas:
  - **Output** (result)
  - **Console** (logs)

Event handling:

- On `event: log`: append to **Console**
- On `event: result`: set **Output**
- On `event: status`/`done`: append status lines to Console (or a third status area)

Runs list click behavior:

- Clicking a past run should populate:
  - Output from `run.result` (if present) or best-effort parse
  - Console from `run.consoleTail` or legacy `run.outputTail`

### 5. Backward compatibility strategy

- Keep emitting `log` events exactly as now.
- Add `result` events (new) without breaking old clients.
- Old UI will continue to show logs in its single output view.
- New UI uses the split view.

### 6. Test plan

- Unit tests for wrapper:
  - `return 123`
  - `return { a: 1 }`
  - `return await Promise.resolve(5)`
  - no return
  - circular return
- Integration test:
  - SSE stream receives `log` events and a single `result` event
- UI test (manual):
  - Output panel shows result
  - Console panel shows logs

## Open questions

1. **Default enablement**: should `return` support be enabled by default or gated behind an env var initially?
2. **Result persistence format**: store raw JSON (Mixed) vs stringified JSON vs both?
3. **Security**: should return value be size-limited (similar to tail)?
4. **Browser runner**: should we also support `return` capture for browser scripts in the UI test mode?

## Rollout

- Phase 1: server-side return capture + persistence + SSE `result`
- Phase 2: admin UI split panels
- Phase 3: optional programmatic API documentation + examples
