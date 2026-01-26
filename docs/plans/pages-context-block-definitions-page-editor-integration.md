---
description: Plan changes - make Context Block Definitions addable from the Page editor (Add Block flow)
---

# Goal
Make **Context Block Definitions** available directly inside the **Page edit modal** so an admin can add a saved definition as a block without switching to Blocks → Context Blocks.

This addresses the current UX issue:
- The "Attach to Page" action requires the Page editor modal to already be open, but the Context Blocks sub-tab does not provide a way to open/select a Page.

# Current state
- Page edit modal has an "Add Block" flow:
  - `select#blocks-add-type` populated from `pagesService.getBlocksSchema()`.
  - Clicking "Add Block" calls `addSelectedBlock()` which calls `addBlock(type)` to append a new `{ id, type, props }` to `state.currentBlocks`.
- Context Block Definitions exist as a separate library:
  - CRUD via `/api/admin/pages/context-block-definitions`.
  - UI under Blocks → Context Blocks.

# Proposed UX (recommended)
## A) Add a second “Add from definition” selector in the Page editor
In the Page modal, next to the existing block type selector:
- Add `select#blocks-add-contextdef` labeled "Add Context Block".
- Options are built from active Context Block Definitions:
  - Display: `Label (code) — type`
  - Value: the definition `code`.
- Add a button "Add" which:
  - Looks up the selected definition from in-memory state
  - Pushes `{ id: uuid(), type: def.type, props: def.props }` into `state.currentBlocks`
  - Re-renders blocks editor

## B) Load definitions automatically when opening the Page editor
When the Page modal is opened (create/edit), fetch:
- `GET /api/admin/pages/context-block-definitions?active=true`

Store in client state:
- `state.contextBlockDefs.items`

Then render options into the new select.

## C) Keep current runtime semantics (copy-on-add)
When adding a definition into a Page, **copy** the `{ type, props }` at that time.
- Pages remain stable even if the library definition changes later.

# Alternative UX (simpler UI, more coupling)
## Single dropdown with “pseudo-types”
Reuse `select#blocks-add-type` by adding options like:
- `contextdef:blog-post-by-slug`

Then `addSelectedBlock()` detects the prefix and adds a block by definition.

Pros:
- No extra UI controls.

Cons:
- More implicit behavior
- Mixed option sources in one dropdown

# API changes
None required. The existing list endpoint is sufficient.

Optional improvement:
- Add `?active=true` filtering support to `adminContextBlockDefinitions.controller.list` (it already exists for Block Definitions and is already implemented similarly in this controller).

# Context Blocks sub-tab changes
Two options:
- Keep "Attach to Page" as a convenience (still works when a Page modal is open), but it is no longer required.
- Or remove/hide it to reduce confusion.

# Open questions (lock-in)
1) Do you prefer the **recommended** two-control UI ("Add Block" + "Add Context Block") or the single dropdown with pseudo-types?
2) Should the Page editor show only `active=true` definitions, or all?
3) Should we keep the "Attach to Page" button in Blocks → Context Blocks, or remove it?

# Acceptance criteria
- While editing a Page, you can add a Context Block Definition from the Page modal without leaving the Page editor.
- The added block is a normal `context.*` block in `page.blocks` and persists when you save the Page.

# Locked decisions
- Two controls in the Page editor ("Add Block" and "Add Context Block")
- Only `active=true` context block definitions are shown in the Page editor selector
- Remove the "Attach to Page" action from Blocks → Context Blocks

# Final implementation
## Page editor UI
Implemented in `views/admin-pages.ejs` Page modal:
- Added `select#blocks-add-contextdef` and a button that calls `addSelectedContextBlockDefinition()`
- The new control inserts a block into `state.currentBlocks` by copying from a selected Context Block Definition:
  - `{ id: uuid(), type: def.type, props: def.props }`

## Loading active definitions
On opening the Page modal (create/edit), the UI loads active definitions:
- `GET /api/admin/pages/context-block-definitions?active=true`

Results are stored in:
- `state.pageContextBlockDefs.items`

And used to populate the selector via:
- `populateContextBlockDefinitionSelect()`

## Blocks → Context Blocks
The "Attach to Page" action has been removed to avoid a flow that depends on cross-tab state.
