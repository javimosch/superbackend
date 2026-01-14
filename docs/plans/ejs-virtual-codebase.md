# EJS Virtual Codebase (DB overrides + Vibe coding + Audit/Rollback)

## Goal
Provide an optional “virtual EJS codebase” inside `@intranefr/superbackend`.

- Host apps keep EJS templates in their repo (filesystem is the default source of truth).
- `@intranefr/superbackend` can store **DB overrides** for selected EJS files.
- Host apps can opt-in to render specific views through a `@intranefr/superbackend` helper that resolves templates from DB-first then filesystem.
- Admin UI provides:
  - file browser + CodeMirror editor
  - vibe coding (LLM-assisted edits)
  - history + rollback
  - revert to default (delete DB override)
  - cache control

Primary initial integration target: **home page only** in host app (e.g. `apres-parties`), to validate runtime behavior before rolling out broadly.

## Key requirements (refinements)

### Audit + rollback + revert-to-default
- All changes to any EJS virtual file must generate auditable records.
- Rollback:
  - can restore a previous DB version
  - should be able to rollback by “grouped changes” (multiple files at once)
- Revert-to-default:
  - removes DB override record (and versions remain for audit/history unless explicitly deleted)
  - runtime falls back to filesystem automatically

### Runtime override cache
- Memory cache only (in-process), **5 minute TTL**.
- Cache invalidation triggers:
  - any virtual EJS file update
  - revert-to-default
  - rollback apply
- Admin control:
  - button/endpoint to clear all EJS virtual cache
- Memory safety:
  - ensure TTL purge (avoid unbounded growth)
  - avoid retaining multiple large strings indefinitely

### Vibe coding: provider + model selection + fallbacks
- Admin UI must allow selecting:
  - LLM provider (OpenAI-compatible) and model
  - store last selection in browser localStorage for UX
- Server must resolve defaults in this order:
  1. UI-requested `providerKey` + `model` (if present)
  2. Global settings defaults (DB):
     - `ejsVirtual.ai.providerKey`
     - `ejsVirtual.ai.model`
  3. Environment variables:
     - `DEFAULT_LLM_PROVIDER_KEY` (optional)
     - `DEFAULT_LLM_MODEL` (optional)
  4. Hard default model: `x-ai/grok-code-fast-1`
- If provider is missing/disabled/misconfigured, fail fast with a clear error (do not silently switch providers).

## Scope and non-goals (v1)

### In scope
- DB storage for virtual EJS files and version history
- Basic admin UI
- LLM “vibe coding” edit flow with patch strategy and fallbacks
- Runtime render helper that host apps opt into
- Audit + rollback + grouped changes
- Inferred/integrated view indexing

### Non-goals
- Automatic full-app migration of all views to DB rendering
- Distributed cache (Redis) or CDN caching
- Multi-tenant per-org EJS customization (v1 is app-global)

## Questions / Decisions

### 1) What EJS files are “available”? (inferred)
Decision: infer EJS files from the **host app cwd**.

- Perform a full scan from `process.cwd()`.
- Respect `.gitignore` if present (skip ignored files).
- Focus on typical view roots:
  - default include: `src/views/**/*.ejs`
  - allow configurable roots via options

Store inferred file metadata in DB so admin can browse without re-scanning constantly.

Fields to track per file:
- `path`
- `inferred=true`
- `integrated=false` initially
- `lastSeenAt` and optional `existsOnFs` boolean

### 2) What files are “integrated”? (runtime used)
Decision: “integrated” means “rendered through the @intranefr/superbackend DB-aware render helper at least once”.

- Implement `@intranefr/superbackend.services.ejsVirtual.render()` (or similar) that host apps call explicitly.
- When called, record a usage signal:
  - update DB flag `integrated=true`
  - increment `renderCount`
  - store `lastRenderedAt`

This gives admin a reliable list:
- inferred views available on disk
- integrated views actually using DB overrides capability (100% ready)

### 3) Vibe coding workflow (LLM edit loop)
Decision: use a tool-driven multi-step LLM process (bounded, safe, deterministic).

Pipeline:
1. Compute available + integrated view paths.
2. Compute partial dependencies:
   - Build dependency maps by parsing EJS includes:
     - direct includes per file
     - reverse deps (who includes me)
     - transitive closure (for multi-file edits)
3. LLM loop (max 20 iterations):
   - LLM can request “read N lines” from any available file (bounded)
   - LLM decides which files to change and emits patches
   - Stop rules:
     - LLM emits `HALT` / no-op
     - patch application succeeds
     - max steps reached
4. UI shows recap + proposed changes.
5. User applies changes (atomic apply):
   - create new DB versions for all affected files
   - write audit entry (group change set)

### Patch strategies (priority order)
Order required:
1. Multi-file patch
2. Single-file patch
3. Full file edit

Recommended patch formats:
- Multi-file patch:
  - `FILE: <path>` headers, then SEARCH/REPLACE blocks per file.
- Single-file patch:
  - SEARCH/REPLACE blocks for current file.
- Full edit:
  - Full file content for current file.

Fallback rules:
- Any parse/apply failure in multi-file patch => fallback to single-file patch (for current file) or re-prompt for smaller scope.
- Any SEARCH mismatch => fallback downward.

## Data model (proposed)

### VirtualEjsFile
One per logical template file.
- `path` (unique, normalized posix relative)
- `enabled` (boolean)
- `content` (string)
- `source` (`filesystem_snapshot | manual | llm | rollback`)
- `baseSha` (sha of filesystem version at snapshot time)
- `inferred` (boolean)
- `integrated` (boolean)
- `renderCount` (number)
- `lastRenderedAt` (date)
- timestamps

### VirtualEjsFileVersion
Append-only history.
- `fileId`
- `content`
- `source`
- `description`
- `groupId` (optional, ties to grouped changes)
- timestamps

### VirtualEjsGroupChange
Represents a user-visible “grouped change” snapshot.
- `title` (e.g. `Grouped changes 2`)
- `summary` (e.g. `Font color change`)
- `filePaths` (array)
- `versionIds` (array)
- `createdBy` (admin actor)
- timestamps

### AuditEvent (existing)
Reuse existing audit system:
- record per-file updates
- record grouped-change apply
- record rollback/revert-to-default

## Runtime render helper (host app integration)

### Required helper
`@intranefr/superbackend.services.ejsVirtual.render(res, viewPath, data, options)`

Responsibilities:
- Resolve template source (DB override if enabled; else filesystem)
- Maintain 5-min TTL memory cache for resolved template strings
- Compile and render with EJS
- Record usage for `integrated` flag

Cache behavior:
- Key: `viewPath + overrideVersionIdOrUpdatedAt`
- TTL: 5 minutes
- Invalidate:
  - on any update to that view
  - on clear-all
- Purge:
  - periodic sweep of expired entries
  - hard cap (optional) to avoid memory blowups

## Admin UI
Expose entry from `/admin/test`.

Page features:
- file explorer (inferred list)
- status badges: inferred / integrated / overridden(enabled)
- editor (CodeMirror)
- actions:
  - Save (manual)
  - Vibe edit (LLM)
  - Create grouped change (optional auto-group on apply)
  - History list + rollback
  - Revert to default (delete override)
  - Clear cache

## API surface (draft)

### Admin (basic-auth)
- `GET /api/admin/ejs-virtual/files`
- `POST /api/admin/ejs-virtual/scan` (re-scan filesystem, update inferred list)
- `GET /api/admin/ejs-virtual/file?path=...`
- `PUT /api/admin/ejs-virtual/file?path=...` (save/update override)
- `POST /api/admin/ejs-virtual/file/revert?path=...` (revert-to-default)
- `POST /api/admin/ejs-virtual/file/rollback` (by version id)
- `POST /api/admin/ejs-virtual/vibe` (LLM flow)
- `POST /api/admin/ejs-virtual/cache/clear`

## Milestones
1. Models + indexes + seed/scan to populate inferred files.
2. Versioning + grouped changes + audit integration.
3. Runtime render helper + TTL cache + invalidation + clear-all.
4. Admin UI under `/admin/test` with editing + history + rollback.
5. Vibe coding tool-loop + patch strategies.

## Acceptance criteria
- Admin can edit EJS override, see audit event, and rollback.
- Revert-to-default removes override and runtime uses filesystem.
- Cache returns consistent content and invalidates on updates.
- Host app integrates helper on home page and it marks view as integrated.
- Grouped changes show history of multi-file edits and support rollback.
