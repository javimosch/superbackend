---
description: Plan AI assistance for creating/editing Pages context blocks (context.db_query + context.service_invoke)
---

# Goal
Add AI assistance to create and edit **Pages context blocks** in the Page Builder (admin Pages UI), with a workflow that is:
- safe-by-construction (strict JSON outputs)
- testable (one-click “Test block” and “Test context phase”)
- aligned with existing AI patterns (Block Definitions AI + UI Components AI)

This document includes the final implementation.

# Locked decisions
- AI defaults: **reuse** existing Blocks AI defaults (same resolver keys as Block Definitions AI).
- Output contract: AI returns only `{ type, props }`.
- Execution: keep it **manual** (admin must Apply and Test).
- UI placement: **Blocks → Context Blocks** sub-tab.

# Current state (relevant)
- Context blocks exist and run server-side (`context.db_query`, `context.service_invoke`).
- Admin testing exists:
  - `POST /api/admin/pages/pages/:id/test-context`
  - `POST /api/admin/pages/pages/:id/test-block`
  - `POST /api/admin/pages/test-block`
- Page Builder already has Blocks AI for **block definitions**:
  - `POST /api/admin/pages/ai/block-definitions/generate`
  - `POST /api/admin/pages/ai/block-definitions/:code/propose`
  - Implemented in `src/services/blockDefinitionsAi.service.js` with strict JSON parsing + validation.
- There is an existing Provider/Model picker partial: `views/partials/llm-provider-model-picker.ejs`.

# Proposed UX
## A) Where AI assist lives
Add an “AI Assist” section inside the **Page editor modal** (same area as blocks editor) focused on `context.*` blocks.

## B) Two primary flows
### 1) Create a new context block (AI Generate)
- User selects:
  - `context.db_query` or `context.service_invoke`
  - optional: target variable name (`assignTo`) suggestion (default empty)
  - optional: cache / timeout toggles
- User writes: “What data do you want and where should it be stored in `pageContext.vars`?”
- Click **Generate Context Block**
- UI shows a proposal JSON for a single block `{ type, props }`.
- User can:
  - Apply (adds block to the page)
  - Test (runs block test endpoint, shows output + elapsedMs)
  - Edit prompt and regenerate

### 2) Edit an existing context block (AI Propose)
- For a selected block, user writes: “Change query to filter by X, add cache key, etc.”
- Click **Propose Edit**
- UI shows a proposed replacement `{ type, props }`.
- User can:
  - Apply (replaces block.props)
  - Test

## C) “Assistant-aware” form helpers
Because admins will rely on AI, add lightweight guardrails in the UI:
- Pre-fill prompt context:
  - page route path example (optionally from repeat `paramKey`)
  - reminder of `$ctx` usage (`{"$ctx":"params.slug"}`)
- Render a small “schema hint” for each context block type (fields + examples).

# Backend plan
## A) New AI endpoints (parallel to block definitions AI)
Add under admin pages routes:
- `POST /api/admin/pages/ai/context-blocks/generate`
- `POST /api/admin/pages/ai/context-blocks/propose`

Request body (generate):
- `prompt` (required)
- `blockType` (required: `context.db_query` | `context.service_invoke`)
- `providerKey` (optional)
- `model` (optional)
- `pageId` (optional, if you want the AI to know the page context)
- `routePath` (optional, default `/_test`)

Request body (propose):
- `prompt` (required)
- `currentBlock` (required `{ type, props }`)
- `providerKey`, `model` (optional)
- `pageId` / `routePath` (optional)

Response:
- `proposal`: `{ type, props }`
- `providerKey`, `model`
- optional: `warnings` (static checks)

Important: **AI endpoints should not auto-save**.

## B) Reuse existing LLM defaults
Use the same mechanism as `blockDefinitionsAi.service.js`:
- resolve provider/model using `resolveLlmProviderModel({ systemKey, providerKey, model })`
- add new system keys:
  - `pages.contextBlocks.generate`
  - `pages.contextBlocks.propose`

Final decision: reuse the existing resolver system keys used by Block Definitions AI:
- `pageBuilder.blocks.generate`
- `pageBuilder.blocks.propose`

This means the existing settings apply:
- `pageBuilder.blocks.ai.providerKey`
- `pageBuilder.blocks.ai.model`

## C) Strict JSON contract (most important)
System prompt should enforce **ONLY JSON** output.

### Proposal JSON schema
Return a single JSON object:
```json
{
  "type": "context.db_query|context.service_invoke",
  "props": {}
}
```

Validation rules:
- `type` must be one of the allowed `context.*` types.
- `props` must be an object.
- If `props.cache` exists, must be an object and `ttlSeconds` must be number.
- If `props.timeout` exists, must be an object and `value` (if present) must be a string.

## D) Add warnings (non-blocking)
Similar to UI Components AI warnings concept:
- Warn if `props.cache.key` is missing but caching enabled.
- Warn if `db_query.limit` is too high.
- Warn if `servicePath` points to known risky namespaces (denylist).

## E) Optional: “validate by execution” mode
After generating/proposing, UI can optionally call existing test endpoints to validate runtime behavior:
- prefer `POST /api/admin/pages/pages/:id/test-block` when pageId exists
- otherwise use `POST /api/admin/pages/test-block` with mock context

# UI plan (admin-pages.ejs)
## A) Add AI section to Blocks → Context Blocks sub-tab
- Provider/model picker (reuse partial)
- Prompt textarea
- Block type selector (`db_query` vs `service_invoke`)
- Buttons:
  - Generate
  - Propose (enabled when a context block is selected)
  - Apply
  - Test

## B) Block selection + apply mechanics
- Selecting a block in the blocks editor should set `state.selectedBlockId`.
- If the selected block is not `context.*`, AI propose/edit is disabled (generate still allowed).

# Open questions (need lock-in)
Resolved.

# Acceptance criteria
- Admin can generate a `context.db_query` block from a prompt, apply it to a page, and test it without leaving the page editor.
- Admin can propose edits to an existing context block and preview/apply.
- AI endpoints are strict JSON, validated, and audited.
- No automatic saving of Pages happens from AI responses.

# Final implementation

## Backend
New files:
- `src/services/pagesContextBlocksAi.service.js`
- `src/controllers/adminPagesContextBlocksAi.controller.js`

Routes (basicAuth protected, rate limited):
- `POST /api/admin/pages/ai/context-blocks/generate`
- `POST /api/admin/pages/ai/context-blocks/propose`

Routing wired in:
- `src/routes/adminPages.routes.js`

### JSON contract
AI response must be a single JSON object:
```json
{ "type": "context.db_query|context.service_invoke", "props": {} }
```

Validation:
- `type` must be `context.db_query` or `context.service_invoke`.
- `props` must be an object.
- Optional validation for `props.cache` and `props.timeout` shapes.

### Prompt context
System prompt includes:
- `$ctx` roots (`params`, `query`, `auth`, `session`, `vars`, `pageContext`)
- Block prop schemas
- Examples
- A list preview of invokable helper namespaces (services/models), and the denylist.

## Admin UI
Implemented in `views/admin-pages.ejs`:
- Blocks tab now includes a **Context Blocks** sub-tab.
- Supports:
  - Generate
  - Propose (selected block)
  - Apply (manual)
  - Test (manual)
- Block selection is enabled in the Page editor blocks list (click to select).
- Optional `mockContext` JSON textarea for test runs.
