---
description: Plan changes for Pages Context Blocks UI: make Apply/Propose persistable, add explicit Save, and add CRUD + attach-to-page workflows
---

# Context
The current **Blocks → Context Blocks** sub-tab implements AI generate/propose for a single `{ type, props }` context block and an **Apply** action that mutates the in-memory page editor state (`state.currentBlocks`). It does **not** persist changes unless the Page modal is saved.

The user expectation is:
- a visible **Save** button related to context block edits
- ability to **CRUD context blocks** (as reusable entities or at least in a focused UI)
- ability to **add context blocks to pages** reliably

This plan proposes changes only (no implementation yet).

# Why “Propose (selected block) / Apply” appears to do nothing
## Propose (selected block)
The current propose flow depends on:
- a non-empty prompt
- a selected block (`state.selectedBlockId`) in the Page blocks editor
- selected block type must start with `context.`

If no block is selected, it will toast “Select a block first”.
If a non-`context.*` block is selected, it will toast “Selected block is not a context.* block”.

If the user is not currently interacting with the **Page modal blocks list** (where clicking a block sets `state.selectedBlockId`), it is easy to be in a state where “selected block” is effectively `null`.

## Apply
Apply currently:
- requires `state.ctxBlocksAiProposal` to be set
- mutates `state.currentBlocks`
- rerenders the blocks editor in the Page modal
- **does not call Page save**

So from a user perspective:
- If the Page modal is closed (or the user expects persistence immediately), Apply “does nothing”.
- If there is no proposal loaded, Apply silently returns with no toast.

# Plan options for “CRUD context blocks”
There are two viable directions. We should pick one.

## Option A (simplest): Per-page context blocks only (no global library)
Treat context blocks as just another entry in `page.blocks[]`, and improve UX to make:
- adding `context.*` blocks obvious
- selecting them obvious
- saving page changes explicit from the Context Blocks panel

### UX changes
- Add a **“Save Page”** button inside the Context Blocks panel.
  - Disabled until a page is loaded/open in the Page modal.
  - When clicked, it triggers the same logic as the existing Page form submit.
- Add **selected block indicator** inside Context Blocks panel:
  - Shows selected block id + type
  - Shows a “Select a context block in the editor” hint when none selected
- Improve Apply behavior:
  - Always toast (error) when no proposal is loaded
  - Optionally offer two Apply actions:
    - “Apply to selected block” (requires selection)
    - “Add as new block” (always available)
- Ensure context block types are available in “Add Block” dropdown:
  - If `blocks-schema` already includes `context.db_query` and `context.service_invoke`, ensure they appear.
  - If not, decide whether to (a) add them to the schema alias, or (b) special-case insert from Context Blocks panel.

### Backend changes
No new persistence endpoints required beyond existing Pages CRUD (`PUT /api/admin/pages/pages/:id`).

### Pros
- Minimal new concepts.
- Directly matches how the runtime resolves context blocks: they’re just part of `page.blocks`.

### Cons
- Not a reusable library; to reuse a context block across pages you must copy/paste or re-generate.

## Option B (more powerful): Add a reusable Context Blocks library (CRUD) + attach-to-page
Introduce a new persisted resource (e.g. `PagesContextBlockDefinition` / `ContextBlockTemplate`) stored similarly to block definitions.

### Proposed model
A context block template includes:
- `code` (string, unique)
- `label` (string)
- `type` (`context.db_query|context.service_invoke`)
- `props` (object)
- optional metadata (`description`, `isActive`, `tags`)

### API
Add admin endpoints (basicAuth protected, rate-limited where appropriate):
- `GET /api/admin/pages/context-block-definitions`
- `POST /api/admin/pages/context-block-definitions`
- `GET /api/admin/pages/context-block-definitions/:code`
- `PUT /api/admin/pages/context-block-definitions/:code`
- `DELETE /api/admin/pages/context-block-definitions/:code`

### UI
In Blocks → Context Blocks:
- Left side: list/search context block definitions
- Right side: edit form for selected definition (type + props JSON)
- Buttons:
  - Save definition
  - Delete definition
  - “Attach to current page” (adds block to `state.currentBlocks`)
- AI actions:
  - Generate definition from prompt
  - Propose edits to selected definition

### Runtime
Pages still store actual blocks in `page.blocks[]`.
Attaching copies `{ id, type, props }` into the page.

### Pros
- Real CRUD and reuse across pages.
- Aligns with existing “Block Definitions” CRUD mental model.

### Cons
- More implementation surface area (model + service + controller + UI).

# Open questions for lock-in
1) Do you want **global reuse** of context blocks (Option B), or is per-page editing enough (Option A)?
2) When attaching a library context block to a page, should it:
   - copy props at attach time (page becomes independent), or
   - reference the library entry (would require a new block type like `context.ref`)?
3) Should “Apply” be allowed to auto-save the page?
   - Recommended: **no auto-save**, but provide an explicit “Save Page” button in the panel.

# Milestones (implementation plan after lock-in)
- Add explicit Save + selection status UX to Context Blocks panel
- Ensure users can add context blocks to pages reliably (schema inclusion or special-case insertion)
- (If Option B) Implement Context Block Definitions CRUD (API + UI)
- Expand docs and add examples for library usage

# Locked decision
Option B: implement a reusable Context Block Definitions library with CRUD and an attach-to-page flow.

# Final implementation
## Data model
New Mongoose model:
- `src/models/ContextBlockDefinition.js`

Stored in collection:
- `page_builder_context_block_definitions`

Fields:
- `code` (unique, lowercase)
- `label`
- `description`
- `type` (`context.db_query|context.service_invoke`)
- `props` (object)
- `version` (auto-incremented on update)
- `isActive`

## Admin API
New controller:
- `src/controllers/adminContextBlockDefinitions.controller.js`

Routes wired in:
- `src/routes/adminPages.routes.js`

Endpoints (basic auth):
- `GET /api/admin/pages/context-block-definitions`
- `POST /api/admin/pages/context-block-definitions`
- `GET /api/admin/pages/context-block-definitions/:code`
- `PUT /api/admin/pages/context-block-definitions/:code`
- `DELETE /api/admin/pages/context-block-definitions/:code`

## Admin UI
Updated in:
- `views/admin-pages.ejs`

Location:
- Page Builder → Blocks → Context Blocks

UI behavior:
- Library table (list/reload + edit action)
- Editor form for a single definition
- Actions:
  - Save Definition
  - Delete
  - Attach to Page (adds a new `{ id, type, props }` entry to the open Page editor’s `state.currentBlocks`)

AI behavior:
- The panel provides **AI Generate Props** (generate only) which calls `POST /api/admin/pages/ai/context-blocks/generate` and loads the resulting `props` JSON into the definition editor.

## Endpoint registry
Admin API test page includes entries for the new CRUD endpoints:
- `src/admin/endpointRegistry.js`
