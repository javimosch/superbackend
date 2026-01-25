# EJS virtual codebase (DB overrides + vibe coding)

## Summary
This feature adds an optional “virtual EJS codebase” layer.

- Files are normally rendered from the filesystem (`src/views/**/*.ejs`).
- When enabled, a DB override for a view (or partial) can replace the filesystem version at runtime.
- Admin UI supports editing, vibe coding (LLM), history/rollback, revert-to-default, and cache control.

## Runtime behavior
### DB-first resolution
When the host app opts into rendering through `@intranefr/superbackend.services.ejsVirtual.render(res, viewPath, data)`:

- If a DB override exists for `viewPath` and it is enabled, it is rendered.
- Otherwise, the filesystem template is rendered.
- Included partials (`include('...')`) are also resolved DB-first.

### Cache
- In-process memory cache only
- TTL: 5 minutes
- Invalidated on:
  - file override update
  - rollback
  - revert-to-default
  - explicit “clear cache” action

## Admin UI
Access via:
- `@intranefr/superbackend` admin test page → **EJS Virtual Codebase**

Capabilities:
- Browse EJS files
- Load and edit content
- Save override
- Revert to default (delete override record)
- View history (latest 50) and rollback
- Run vibe coding
  - provider + model selectable

## LLM provider/model selection
Provider/model selection resolves defaults in this order:
1. UI-provided `providerKey` + `model`
2. Centralized defaults:
   - System defaults: `llm.systemDefaults.ejsVirtual.vibe.apply.{providerKey,model}`
   - Global defaults: `llm.defaults.{providerKey,model}`
3. Legacy fallback:
   - `ejsVirtual.ai.providerKey`
   - `ejsVirtual.ai.model`
4. Environment fallback (last resort):
   - `DEFAULT_LLM_PROVIDER_KEY`
   - `DEFAULT_LLM_MODEL`
5. Hard default model:
   - `x-ai/grok-code-fast-1`

If no provider can be resolved, vibe coding fails with a validation error.

## APIs (admin)
- `GET /api/admin/ejs-virtual/files`
- `GET /api/admin/ejs-virtual/file?path=...`
- `PUT /api/admin/ejs-virtual/file?path=...`
- `POST /api/admin/ejs-virtual/file/revert?path=...`
- `GET /api/admin/ejs-virtual/history?path=...`
- `POST /api/admin/ejs-virtual/rollback`
- `POST /api/admin/ejs-virtual/vibe`
- `POST /api/admin/ejs-virtual/cache/clear`

## Host app integration
The host app must opt in per route.

In `apres-parties`, only the home page is integrated initially:
- `/` uses `@intranefr/superbackend.services.ejsVirtual.render(res, 'public/home', {})`

## Data model
- `VirtualEjsFile`: current override state
- `VirtualEjsFileVersion`: append-only history
- `VirtualEjsGroupChange`: grouped change snapshots
- `AuditEvent`: existing audit log used to record mutations
