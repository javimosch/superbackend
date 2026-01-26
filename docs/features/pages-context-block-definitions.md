---
description: Pages Context Block Definitions library (CRUD + attach-to-page)
---

# Pages Context Block Definitions

## Overview
The admin Page Builder includes a reusable library of **Context Block Definitions**. A Context Block Definition is a persisted template for a Pages SSR `context.*` block. Definitions can be attached to Pages, which copies the definition into the Page’s `blocks` array.

Supported block types:
- `context.db_query`
- `context.service_invoke`

## Data model
Stored as Mongo documents via Mongoose:
- Model: `ContextBlockDefinition` (`src/models/ContextBlockDefinition.js`)
- Collection: `page_builder_context_block_definitions`

Fields:
- `code`: unique identifier (lowercase)
- `label`
- `description`
- `type`: `context.db_query|context.service_invoke`
- `props`: JSON object (block props)
- `version`: numeric, auto-incremented on update
- `isActive`: boolean

## Admin API
All endpoints are basic-auth protected.

CRUD endpoints (mounted under admin pages routes):
- `GET /api/admin/pages/context-block-definitions`
- `POST /api/admin/pages/context-block-definitions`
- `GET /api/admin/pages/context-block-definitions/:code`
- `PUT /api/admin/pages/context-block-definitions/:code`
- `DELETE /api/admin/pages/context-block-definitions/:code`

Implementation:
- Controller: `src/controllers/adminContextBlockDefinitions.controller.js`
- Routes: `src/routes/adminPages.routes.js`

## Admin UI
Location:
- Page Builder → Blocks → Context Blocks

The UI provides:
- A library table to list/reload definitions and open a definition for editing.
- An editor form to create or update a definition.
- Actions:
  - Save Definition
  - Delete

## Page editor integration
The Page edit modal supports adding a saved Context Block Definition as a block.

Controls:
- "Add Block" (standard blocks)
- "Add Context Block" (active context block definitions)

Behavior:
- The Page editor loads active definitions via `GET /api/admin/pages/context-block-definitions?active=true`.
- Selecting a definition and adding it inserts a new `context.*` block into `page.blocks` by copying `{ type, props }`.

## Relationship to Pages
Pages store the runtime blocks as part of `page.blocks`.

When attaching a definition to a Page, the definition is copied into the Page’s blocks array. Changes to the definition do not retroactively modify existing Pages.
