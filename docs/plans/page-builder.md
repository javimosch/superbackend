---
description: page builder (drag-and-drop pages)
---

# Goals
- Provide a drag-and-drop Page Builder to create/edit pages.
- Pages are addressable by stable URLs based on `pagesPrefix + relativeBaseUrl + slug`.
- Support a template/layout system (WordPress-like) with reuse across pages.
- Reuse the existing “virtual EJS” system for server-rendered templates and AI-assisted edits.

# Current routing constraints (from code)
- `adminPath` is configurable via middleware option `adminPath` (default `/admin`).
- The middleware mounts many API routes under `/api/*` and serves static files from `public/` at the router root via `express.static(...)`.
- Admin assets are served under `${adminPath}/assets`.

Implication: any pages system mounted at `/` must avoid collisions with:
- `/api` (API routes)
- `/public` (explicitly used for sdk/assets)
- `adminPath` (admin UI)
- Any other existing first-segment routes you want to reserve (e.g. `/w` for workflow webhook)

# URL model
## Definitions
- **pagesPrefix**: a global mount prefix for all pages.
  - Examples: `/pages`, `/p`, or `/`.
- **relativeBaseUrl**: optional per-page (or per-collection) segment(s) inserted between prefix and slug.
  - Example: `associations`
- **slug**: last segment or path for the page.
  - Example: `list-of-associations-in-france`

## URL formula
`/`-normalized join of:
- `pagesPrefix`
- `relativeBaseUrl` (optional)
- `slug`

Example:
- `pagesPrefix=/pages`
- `relativeBaseUrl=associations`
- `slug=list-of-associations-in-france`
- Final: `/pages/associations/list-of-associations-in-france`

## Collision rules
### When `pagesPrefix === '/'`
- **Forbidden slugs (first segment)**: must not equal any reserved top-level segment.
- Reserved segments should include:
  - `api`
  - `public`
  - `admin` (and also the first segment of the configured `adminPath`, e.g. `backoffice` if `adminPath=/backoffice`)
  - (recommended) `w` (workflow webhook route)

This can be implemented as a single “reservedSegments” set computed at runtime.

### When `pagesPrefix !== '/'`
- Slugs can be unrestricted (subject to general validation), because the namespace is isolated.

### pagesPrefix validation
- `pagesPrefix` itself must not be `api`, `public`, `admin`, nor match the `adminPath` first segment.
- If you allow `pagesPrefix='/'`, then you must enforce the forbidden first segment list.

# Rendering model: “virtual filesystem” for pages
You want pages represented like a virtual folder with “drop-in” files:
- `index.html` or `index.ejs`
- `index.js`
- `index.css`

## Proposal A (recommended): Page = route + entry template + assets
Represent each page with a DB model that points to a “bundle” of virtual files:
- `page.routePath` (computed from prefix/base/slug)
- `page.entryViewPath` (e.g. `pages/<pageId>/index.ejs`)
- `page.assets` (virtual `index.css`, `index.js`)

Where “virtual files” are stored similarly to `VirtualEjsFile` and can be versioned.

Why this fits your codebase:
- You already have `ejsVirtual.service.renderToString()` which can render EJS from either filesystem or DB override, with proper `include()` handling.
- You already have an audit + version + group change system for EJS edits (`VirtualEjsFileVersion`, `VirtualEjsGroupChange`).

## Proposal B: Page = JSON blocks + renderer template
Store page content as JSON (rows/blocks) and render via a single template:
- `views/pages-runtime/page.ejs` reads `page.blocks` and uses a block registry.

This is closer to WordPress/Gutenberg (blocks), and templates/layouts become purely “wrappers” around the block renderer.

# Template/layout system (WordPress-like) leveraging Virtual EJS
## Concepts
- **Layout**: global wrapper (HTML skeleton) that defines `head`, `header`, `footer`, and injects `body` content.
  - In EJS, this can be done with includes/partials.
- **Template**: reusable page “type” (e.g. landing page, listing page, article page).
  - Template decides how to render blocks/data.
- **Partial**: reusable fragments like navigation, hero, CTA.
- **Block**: drag-and-drop component with schema + render function.

## How to map to your Virtual EJS system
- Keep templates/layouts/partials as EJS files under a dedicated namespace in views, e.g.:
  - `views/pages/layouts/default.ejs`
  - `views/pages/templates/landing.ejs`
  - `views/pages/partials/navbar.ejs`
  - `views/pages/blocks/hero.ejs`
- Use `VirtualEjsFile` overrides for any of the above, enabling:
  - Runtime customization
  - AI-assisted editing (your existing `/api/admin/ejs-virtual/vibe`)
  - Version history / rollback

## Recommended layering pattern
- Page entry `views/pages/runtime/page.ejs`:
  - selects a layout
  - includes the chosen template
- Template renders blocks by including `views/pages/blocks/<type>.ejs`.

This keeps “builder data” (blocks JSON) separate from “rendering code” (EJS templates).

# Assets (CSS/JS)
You have two reasonable paths:
- **Inline**: render `<style>` / `<script>` from virtual files stored in DB.
  - Simplest to ship, no static build.
  - Must implement CSP/sanitization decisions.
- **Served endpoints**: `/pages-assets/:pageId/index.css` + `/pages-assets/:pageId/index.js`.
  - Better caching (`ETag`), avoids huge HTML.

# Admin UX + AI assistance
## Admin UX
- Provide an admin UI section (under `adminPath`) for Pages:
  - list pages
  - create page (slug/baseUrl/template/layout)
  - edit page blocks
  - edit underlying EJS/CSS/JS (like your existing EJS virtual editor)

## AI assistance
Two levels of AI help:
- **Builder-level**: “Change this page: add a hero section, update CTA text…” (LLM edits the blocks JSON).
- **Code-level**: “Update the template markup / CSS / JS…” (LLM produces patch edits like `ejsVirtualService.vibeEdit`).

Given you already have the patch-based approach for EJS, the safest plan is:
- Start with **code-level** AI assistance for EJS templates.
- Add builder-level AI later once blocks schema is stable.

# Security / safety constraints (important)
- Decide whether page JS is allowed at all. If yes:
  - you must treat it as “trusted admin-authored code” (not end-user content)
  - keep it behind admin auth to edit
  - consider CSP headers and/or sandboxed iframes if you ever allow non-admin editing
- EJS execution is powerful. Treat page/template editing as admin-only.

# Resolution order (routing)
Recommended precedence:
- Keep existing `express.static(public)` and `/api/*` handling unchanged.
- Mount the pages router after API routes (and after static), or mount under a non-root prefix by default (`/pages`).
- If `pagesPrefix='/'`, enforce reserved segments so you never capture `/api/*`, `/public/*`, `${adminPath}/*`, etc.

# Data model (plan-level)
Start minimal:
- `Page`:
  - `slug`
  - `relativeBaseUrl` (optional)
  - `templateKey`
  - `layoutKey`
  - `blocks` (JSON) OR `entryViewPath` (if going template-first)
  - `status` (draft/published)
  - `updatedAt`

Optional later:
- `PageTemplate` / `PageLayout` as named entities (but you can initially represent them as EJS files in `views/pages/...` and manage via virtual EJS overrides).

# Locked-in decisions
- **Q1**: Both global and per-tenant/org via a `tenantId` field + global flag
- **Q2**: Pages can render dynamic DB-backed data (listing pages, etc.)
- **Q3**: CMS-like mode (`pagesPrefix = '/'`) with strict reserved segment enforcement
- **Q4**: Collections/folders for `relativeBaseUrl` grouping (`PageCollection` model)
- **Q5**: Custom JS per page allowed at launch (admin-only editing, security-aware)

# Implementation plan (locked)

## Phase 1: Models + APIs
- `PageCollection` model: `slug`, `name`, `description`, `tenantId`, `status`
- `Page` model: `slug`, `collectionId`, `title`, `templateKey`, `layoutKey`, `blocks` (JSON), `customCss`, `customJs`, `seoMeta`, `tenantId`, `status`
- Admin CRUD APIs under `/api/admin/pages` and `/api/admin/page-collections`

## Phase 2: Routing + collision detection
- Add `pagesPrefix` option to middleware (default `'/'`)
- Compute reserved segments at runtime: `api`, `public`, `w`, first segment of `adminPath`
- Mount pages catch-all router after all other routes
- Validate collection slugs and page slugs against reserved list when `pagesPrefix === '/'`

## Phase 3: Rendering via Virtual EJS
- Create base EJS files: `views/pages/layouts/default.ejs`, `views/pages/templates/default.ejs`, block partials
- Implement `pages.service.js` with `renderPage()` using `ejsVirtual.service.renderToString()`
- Serve page assets via `/page-assets/:pageId/style.css` and `/page-assets/:pageId/script.js`

## Phase 4: Admin UI
- Add Pages section to admin dashboard
- List/create/edit pages and collections
- Inline EJS/CSS/JS editor (reuse virtual EJS editor pattern)

## Phase 5: AI assistance
- Reuse `ejsVirtual.vibeEdit` for template/layout edits
- Add block-level AI editing once schema is stable

# Implementation Status (Completed)

## Files Created

### Models
- `src/models/Page.js` - Page model with slug, collectionId, title, templateKey, layoutKey, blocks, customCss, customJs, seoMeta, tenantId, isGlobal, status, publishedAt
- `src/models/PageCollection.js` - Collection model with slug, name, description, tenantId, isGlobal, status

### Services
- `src/services/pages.service.js` - Page service with:
  - `computeReservedSegments()` - Compute reserved URL segments
  - `isReservedSegment()` - Check if segment is reserved
  - `validateSlug()`, `validateCollectionSlug()`, `validatePageSlug()` - Slug validation
  - `buildRoutePath()` - Build full URL path
  - `findPageByRoutePath()` - Find page by URL
  - `renderPage()` - Render page using Virtual EJS
  - `listPages()`, `listCollections()` - Query helpers

### Controllers
- `src/controllers/adminPages.controller.js` - Admin CRUD operations for pages and collections

### Routes
- `src/routes/adminPages.routes.js` - Admin API routes (`/api/admin/pages/*`)
- `src/routes/pages.routes.js` - Public page serving router (catch-all)

### Views
- `views/admin-pages.ejs` - Admin UI for page/collection management
- `views/pages/runtime/page.ejs` - Entry point for page rendering
- `views/pages/layouts/default.ejs` - Default layout
- `views/pages/layouts/minimal.ejs` - Minimal layout
- `views/pages/layouts/sidebar.ejs` - Sidebar layout
- `views/pages/templates/default.ejs` - Default template
- `views/pages/templates/landing.ejs` - Landing page template
- `views/pages/templates/article.ejs` - Article template
- `views/pages/templates/listing.ejs` - Listing template
- `views/pages/partials/header.ejs` - Site header
- `views/pages/partials/footer.ejs` - Site footer
- `views/pages/partials/sidebar.ejs` - Sidebar navigation
- `views/pages/blocks/hero.ejs` - Hero block
- `views/pages/blocks/text.ejs` - Text block
- `views/pages/blocks/image.ejs` - Image block
- `views/pages/blocks/cta.ejs` - CTA block
- `views/pages/blocks/features.ejs` - Features grid
- `views/pages/blocks/testimonials.ejs` - Testimonials
- `views/pages/blocks/faq.ejs` - FAQ accordion
- `views/pages/blocks/contact.ejs` - Contact form
- `views/pages/blocks/html.ejs` - Custom HTML block

### Middleware Updates
- `src/middleware.js` - Added:
  - `pagesPrefix` option (default `/`)
  - `router.pagesPrefix` property
  - Admin pages route at `${adminPath}/pages`
  - Pages API routes at `/api/admin/pages`
  - Public pages catch-all router (last before error handler)
  - App settings for `pagesPrefix` and `adminPath`

## Documentation
- `docs/features/page-builder.md` - Full feature documentation
