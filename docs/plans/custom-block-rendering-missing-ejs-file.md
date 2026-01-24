---
description: fix custom block rendering when EJS file is missing
---

# Problem
User added a custom block called “pricing” to a page, but it isn’t rendering. Logs show:
```
[ejsVirtual] Include not found: pages/blocks/pricing_section.ejs (parent: /home/jarancibia/ai/saas-backend/views/pages/templates/listing.ejs)
```

The template `listing.ejs` includes blocks via:
```ejs
<%- include('../blocks/' + block.type + '.ejs', { block, page, req }) %>
```

So the page’s block JSON has `type: 'pricing_section'` but the file `views/pages/blocks/pricing_section.ejs` does not exist.

# Important clarification
`BlockDefinition` is a **DB registry/schema** for blocks (fields, labels, validation). It is not an EJS template store.

The runtime renderer that supports DB overrides is **Virtual EJS** via `VirtualEjsFile` records. Virtual EJS can resolve templates from:
- DB: `VirtualEjsFile` (when `enabled: true` and `content` is non-empty)
- FS: `views/...` fallback

Therefore, “rendering from DB” for blocks means: create a `VirtualEjsFile` at path `pages/blocks/<blockType>.ejs`.

# Root causes
1. The admin UI allows adding block types that don’t have corresponding EJS files.
2. No validation warns the admin that the block type has no template.
3. The EJS include fails silently (ejsVirtual logs a warning and skips it), leading to missing content on the public page.

# Proposed solutions

## Option 1: Create missing EJS file (quick fix)
- Create `views/pages/blocks/pricing_section.ejs` with a sensible default rendering.
- Ensure the block’s props are displayed safely.

## Option 1b: Create DB-backed block template via Virtual EJS (aligns with “DB version”)
- Create a `VirtualEjsFile` record:
  - `path: pages/blocks/pricing_section.ejs`
  - `enabled: true`
  - `content: <EJS template>`
- This will cause `ejsVirtual` to include the block from DB and never touch FS for that include.

## Option 2: Add validation in admin UI (prevent future)
- When loading the block schema, check that each block type has a corresponding EJS file in `views/pages/blocks/`.
- Show warnings in the admin UI for missing templates.
- Optionally prevent adding blocks without templates.

## Option 3: Graceful fallback rendering
- In templates, wrap includes in try/catch or check file existence before including.
- Render a placeholder like “Block type X not available” instead of silently skipping.

## Option 4: DB-backed Virtual EJS blocks
Allow block templates to be stored in the database via Virtual EJS, just like templates/layouts.

- Resolution order: DB override → filesystem.
- Provide an admin UI to edit block EJS files under `pages/blocks/*.ejs`.

## Option 5: Store EJS template in BlockDefinition (bigger change)
- Add a field like `templateEjs` (or `template`) to `BlockDefinition`.
- Extend `ejsVirtual` includer so that when it tries to include `pages/blocks/<type>.ejs`, it checks `BlockDefinition` as a fallback source.
- This makes BlockDefinition the authoritative place for both schema + rendering.

# Recommended plan
1. **Immediate**: Create a DB-backed `VirtualEjsFile` for `pages/blocks/pricing_section.ejs` (matches the desired “render from DB” behavior).
2. **Prevention**: Add a lightweight validator that checks block types against effective templates (DB override or FS fallback) and surface warnings in the admin UI.
3. **Future**: Consider adding first-class block template editing (Virtual EJS UI for `pages/blocks/*`) or the larger BlockDefinition-template consolidation.

# Final implementation

## DB-backed block templates (Virtual EJS)
- Block templates can now be edited as `VirtualEjsFile` records under:
  - `pages/blocks/<blockCode>.ejs`
- At runtime, `ejsVirtual` already prefers DB overrides over filesystem for includes, so blocks render from DB when an enabled override exists.

## Admin UI
- Page Builder → Blocks list now includes a "Template" action per block.
- Clicking it opens the existing Virtual EJS editor for `pages/blocks/<code>.ejs`.
- If neither FS nor DB template exists, the UI seeds a small default template into DB and opens the editor.

## Admin API adjustment
- `GET /api/admin/ejs-virtual/file` now tolerates missing FS files so DB-only templates can be created and edited.

# Open questions
- Do you want the pricing block to use a specific design/layout, or a generic placeholder?
- Should we prevent adding blocks without templates, or just warn the user?
- Should the admin UI show an “Edit template” link for each block type (open Virtual EJS editor if DB-backed, or instruct to edit files)?

# Lock-in questions
1. Do you want the authoritative “DB version” of a block template to be:
   - **VirtualEjsFile at `pages/blocks/<type>.ejs`** (minimal change, uses existing Virtual EJS system)
   - or **stored inside BlockDefinition** (bigger change, but a single source of truth)
2. If we go with VirtualEjsFile, do you want a dedicated UI in Blocks tab to edit the EJS template per block type?

# Files to touch
- `views/pages/blocks/pricing_section.ejs` (create)
- `src/services/pages.service.js` or `src/controllers/adminPages.controller.js` (add validation helper)
- `views/admin-pages.ejs` (show warnings for missing templates)

# Notes
This plan intentionally separates:
- **BlockDefinition (schema/metadata)**
- **Block template (EJS)**

If you want BlockDefinition to fully control rendering, choose Option 5.
