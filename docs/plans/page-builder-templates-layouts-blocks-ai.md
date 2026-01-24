---
description: page builder - templates/layouts editor + blocks CRUD + ai assistance
---

# Goals
- Add two new tabs within the Page Builder admin UI for editing **Templates** and **Layouts**.
- Add the ability to **CRUD block definitions** (block registry) and create/edit them using **AI assistance**.
- When a block field is `type: "json"` (ex: `items` JSON array), display **help text** showing the expected JSON structure.

# Locked-in decisions
- Blocks registry uses a dedicated `BlockDefinition` model (database).
- The legacy JSON Config alias `page-builder-blocks-schema` remains supported as a base schema.
- JSON fields show an `example` snippet (pretty-printed) in the editor.

# Current State (relevant)

## Page Builder UI
- Implemented as a single EJS view: `views/admin-pages.ejs`.
- Currently has 2 tabs:
  - Pages
  - Collections
- It already loads a blocks schema from `/api/admin/pages/blocks-schema` and uses it to render per-block field forms.

## Templates + Layouts
- Server-side templates/layouts exist on filesystem:
  - `views/pages/templates/*.ejs`
  - `views/pages/layouts/*.ejs`
- The Page Builder API exposes lists:
  - `GET /api/admin/pages/templates`
  - `GET /api/admin/pages/layouts`
- Editing of EJS files is already supported via the **Virtual EJS** system:
  - Routes: `src/routes/adminEjsVirtual.routes.js` (basic auth protected)
  - Controller: `src/controllers/adminEjsVirtual.controller.js`
  - Service: `src/services/ejsVirtual.service.js`
  - Includes:
    - list files
    - get file
    - save file
    - revert
    - history/rollback
    - AI-assisted "vibe" edit

## Blocks schema
- Currently sourced from JSON Config alias:
  - `page-builder-blocks-schema`
- Fallback schema lives in `src/services/pages.service.js`.
- Server-side validation is done by `pagesService.validateBlocks(blocks, schema)`.

Updated approach:
- The blocks schema is resolved as:
  - base = JSON Config alias `page-builder-blocks-schema` (if present) else built-in default
  - overlay = active `BlockDefinition` entries (merged on top)

# Proposed Product/UX Decisions (to lock)

## A) Templates + Layouts editing scope
- The system should treat templates/layouts as **EJS files** (not DB models).
- Editing should be implemented as a focused UI on top of **Virtual EJS**:
  - It should filter to the relevant paths only:
    - Templates: `views/pages/templates/*.ejs`
    - Layouts: `views/pages/layouts/*.ejs`
  - It should show:
    - filesystem content (read-only)
    - DB override content (editable)
    - effective content
    - history
    - enable/disable override
    - revert
    - AI vibe edit

## B) Block registry CRUD source of truth
Pick one:
- Option 1 (recommended): keep JSON Config as the source of truth
  - CRUD = CRUD the JSON Config doc behind `page-builder-blocks-schema`
  - Pros:
    - minimal new backend
    - reuses existing admin JSON Config editor
    - avoids new persistence model
  - Cons:
    - less discoverable (nested JSON)
    - harder to enforce per-block validation / uniqueness rules
- Option 2: create a dedicated BlockDefinition model + API
  - Pros:
    - better UI/UX, explicit entities
    - can enforce validation, uniqueness, ownership
  - Cons:
    - more backend + migration

## C) AI assistance scope
- Templates/layouts AI: reuse existing `POST /api/admin/ejs-virtual/vibe`.
- Blocks AI:
  - If we keep JSON Config as source-of-truth, AI edits should produce:
    - either a patch to the JSON config content
    - or a fully regenerated block definition object (validated before save)
  - Safety: AI must not be able to write arbitrary JS/EJS; only block schema JSON.

# Implementation Plan

## Phase 1: Templates & Layouts tabs in Page Builder UI
- Add tabs:
  - Pages
  - Collections
  - Templates
  - Layouts
- For Templates tab:
  - list available templates from existing endpoint (`/api/admin/pages/templates`)
  - map each template key to its EJS path (`pages/templates/<key>.ejs`)
  - provide actions:
    - Open editor
    - Preview (optional)
- For Layouts tab:
  - list from `/api/admin/pages/layouts`
  - map to `pages/layouts/<key>.ejs`
  - provide actions:
    - Open editor

## Phase 2: Reuse Virtual EJS editor capabilities from within Page Builder
- Add a small in-page editor panel/modal with:
  - file picker (template/layout list)
  - content editor (DB override)
  - toggle enabled
  - save + revert
  - history list + rollback
  - AI vibe edit (prompt input)
- Use existing Virtual EJS endpoints:
  - `GET /api/admin/ejs-virtual/file?path=<relPath>`
  - `PUT /api/admin/ejs-virtual/file?path=<relPath>`
  - `POST /api/admin/ejs-virtual/file/revert?path=<relPath>`
  - `GET /api/admin/ejs-virtual/history?path=<relPath>`
  - `POST /api/admin/ejs-virtual/rollback`
  - `POST /api/admin/ejs-virtual/vibe`

## Phase 3: Blocks registry CRUD

### Option 1 (JSON Config-backed CRUD)
- Add a new "Blocks" tab inside Page Builder (or extend existing block editor UI):
  - list block types (from schema)
  - create new block type
  - edit block type (label, description, fields)
  - delete block type
- Backed by JSON Config CRUD:
  - either:
    - reuse existing JSON Config admin module UX by deep-linking
    - or provide a dedicated blocks UI that reads/writes only the schema object

### Option 2 (Dedicated BlockDefinition model)
- Create new API and persistence:
  - list/create/update/delete block definitions
  - derive `pagesService.getBlocksSchema()` from these definitions (with a fallback)
- Provide a migration path:
  - if JSON config exists, import into DB model

Implemented:
- Added `BlockDefinition` model.
- Added admin CRUD endpoints under `/api/admin/pages/block-definitions`.
- Updated `pagesService.getBlocksSchema()` to merge `BlockDefinition` entries on top of the legacy JSON config schema.

## Phase 4: JSON field schema help text
- Extend blocks schema format to support field-level hints, for example:
  - `helpText`: free-form help displayed under the field
  - `jsonSchema`: a JSON Schema snippet for the JSON field
  - `example`: a JSON example shown in the UI
- Admin UI behavior:
  - For `type: "json"` fields:
    - show a collapsible help section ("Expected JSON")
    - render example JSON pretty-printed
    - optionally validate JSON shape client-side if `jsonSchema` is present

Implemented:
- `type: "json"` fields render `example` (if present) above the textarea.

## Phase 5: AI assistance for blocks
- Add UI actions:
  - "Generate block" (from text prompt)
  - "Edit block with AI" (prompt + selected existing block definition)
- Implementation approach:
  - The AI output should be strictly validated as JSON against an internal schema before saving.
  - Store audit events for:
    - block.create
    - block.update
    - block.ai_edit

Implemented:
- AI endpoints return JSON proposals (they do not auto-save):
  - `POST /api/admin/pages/ai/block-definitions/generate`
  - `POST /api/admin/pages/ai/block-definitions/:code/propose`

# Open Questions (need answers before lock-in)

## Templates/Layouts UX
- Should Templates/Layouts be edited:
  - only via Page Builder tabs
  - or should Page Builder link to the existing EJS Virtual admin UI (if one exists) and we avoid duplicating an editor?
- Should we allow creating new templates/layouts from the UI, or only editing existing keys?
- Naming strategy:
  - do we allow arbitrary keys (and thus new `.ejs` files)
  - or only a fixed registry?

## Blocks registry
- Do you want block registry stored as:
  - JSON Config only (fastest)
  - a dedicated DB model (cleaner long-term)
- Do block definitions need multi-tenancy (per tenant block sets) or global only?

## AI assistance
- Should AI be allowed to:
  - create new block types
  - add fields to existing types
  - generate `example` / `jsonSchema` for JSON fields
- What LLM safety constraints are required (e.g. maximum size, forbidden keys)?

## JSON field help
- Do you prefer:
  - a simple `helpText` string
  - or structured `jsonSchema` + `example`
- Should the UI enforce JSON array/object shape client-side or only display guidance?

# Acceptance Criteria
- Templates and Layouts are editable from the Page Builder UI without bypassing admin auth.
- Edits are versioned and revertible (via existing Virtual EJS mechanisms).
- Blocks registry can be edited (at least in JSON Config form) without hand-editing raw JSON.
- JSON fields show explicit, consistent schema guidance.
- AI-assisted actions are auditable and validated before save.
