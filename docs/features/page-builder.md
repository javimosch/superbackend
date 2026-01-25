# Page Builder

A drag-and-drop page creation system with template/layout support, SEO configuration, and custom CSS/JS per page.

## Overview

The Page Builder allows creating and managing pages through an admin interface. Pages are served at configurable URL paths and rendered using the Virtual EJS system for maximum flexibility.

## URL Structure

Pages are served at URLs following this pattern:

```
[pagesPrefix] + [collectionSlug] + [pageSlug]
```

Examples:
- `/my-page` (root-level page when pagesPrefix is `/`)
- `/blog/my-article` (page in "blog" collection)
- `/pages/products/widget` (page in "products" collection when pagesPrefix is `/pages`)

## Configuration

### Middleware Options

```javascript
const middleware = require('@intranefr/superbackend');

app.use(middleware({
  pagesPrefix: '/',      // Default: '/' (CMS-like)
  adminPath: '/admin',   // Admin panel path
}));
```

### Reserved Segments

When `pagesPrefix` is `/`, the following first-level segments are reserved and cannot be used as collection or page slugs:
- `api`
- `public`
- `admin` (or the first segment of `adminPath`)
- `w`

## Data Models

### PageCollection

Groups pages under a common URL prefix (folder).

| Field | Type | Description |
|-------|------|-------------|
| `slug` | String | URL segment (e.g., "blog") |
| `name` | String | Display name |
| `description` | String | Optional description |
| `tenantId` | ObjectId | Organization ID for multi-tenant |
| `isGlobal` | Boolean | Whether visible to all tenants |
| `status` | String | `active` or `archived` |

### Page

Individual page with content and configuration.

| Field | Type | Description |
|-------|------|-------------|
| `slug` | String | URL segment |
| `collectionId` | ObjectId | Parent collection (optional) |
| `title` | String | Page title |
| `templateKey` | String | Template to use (`default`, `landing`, `article`, `listing`) |
| `layoutKey` | String | Layout to use (`default`, `minimal`, `sidebar`) |
| `blocks` | Array | Content blocks (JSON) |
| `customCss` | String | Page-specific CSS |
| `customJs` | String | Page-specific JavaScript |
| `seoMeta` | Object | SEO configuration (title, description, keywords, ogImage, canonicalUrl) |
| `tenantId` | ObjectId | Organization ID for multi-tenant |
| `isGlobal` | Boolean | Whether visible to all tenants |
| `status` | String | `draft`, `published`, or `archived` |
| `publishedAt` | Date | When page was published |

## Templates

Templates define how page content is structured. Located in `views/pages/templates/`.

### Available Templates

- **default**: Basic page with block rendering
- **landing**: Marketing landing page with hero section
- **article**: Blog post or article layout with date
- **listing**: Grid or list display for items

### Creating Custom Templates

Create an EJS file in `views/pages/templates/`:

```ejs
<%# views/pages/templates/custom.ejs %>
<div class="custom-template">
  <h1><%= page.title %></h1>
  <% for (const block of blocks) { %>
    <%- include('../blocks/' + block.type + '.ejs', { block, page, req }) %>
  <% } %>
</div>
```

## Layouts

Layouts wrap templates with common HTML structure. Located in `views/pages/layouts/`.

### Available Layouts

- **default**: Standard layout with header and footer
- **minimal**: Clean layout without navigation
- **sidebar**: Layout with sidebar navigation

### Layout Variables

| Variable | Description |
|----------|-------------|
| `page` | Page document |
| `blocks` | Page content blocks |
| `seoMeta` | SEO configuration |
| `customCss` | Page CSS |
| `customJs` | Page JavaScript |
| `templatePath` | Template being used |
| `req` | Express request object |

## Blocks

Content blocks are the building units of pages. Each block has a `type` and `props`.

Blocks are stored in the page as an array of:

```json
{
  "id": "<stable-id>",
  "type": "hero",
  "props": {}
}
```

### Available Block Types

| Type | Description | Props |
|------|-------------|-------|
| `hero` | Hero section | `title`, `subtitle`, `ctaText`, `ctaUrl` |
| `text` | Rich text block | `title`, `content` (HTML) |
| `image` | Image with caption | `src`, `alt`, `caption`, `fullWidth`, `align` |
| `cta` | Call to action | `title`, `description`, `buttonText`, `buttonUrl` |
| `features` | Feature grid | `title`, `items[]` (title, description, icon) |
| `testimonials` | Testimonials | `title`, `items[]` (quote, name, role, avatar) |
| `faq` | FAQ accordion | `title`, `items[]` (question, answer) |
| `contact` | Contact form | `title`, `action`, `formId`, `buttonText` |
| `html` | Custom HTML | `html` |

### Block Structure

```json
{
  "id": "b1e2c3...",
  "type": "hero",
  "props": {
    "title": "Welcome",
    "subtitle": "Build amazing pages",
    "ctaText": "Get Started",
    "ctaUrl": "/signup"
  }
}
```

## Blocks Schema (JSON Config)

The admin block editor is **schema-driven**.

- **Legacy schema source**: JSON Config alias `page-builder-blocks-schema`
- **Primary registry**: `BlockDefinition` model (database)

Resolution order:
- A base schema is loaded from `page-builder-blocks-schema` (if present) or a built-in default.
- Active `BlockDefinition` entries are merged on top of the base schema.

The schema determines:
- available block types
- per-block fields and field types
- server-side validation for `Page.blocks`

If the JSON Config does not exist yet, the system falls back to an internal default schema.

You can manage JSON configs via the admin UI at `/admin/json-configs`.

## Draft Preview

Public routes render **published pages only** by default.

To preview drafts, open the page with:

```
?draft=1
```

Draft preview requires **basic auth** (same credentials as the admin panel).

## Admin API

### Collections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/pages/collections` | List collections |
| GET | `/api/admin/pages/collections/:id` | Get collection |
| POST | `/api/admin/pages/collections` | Create collection |
| PUT | `/api/admin/pages/collections/:id` | Update collection |
| DELETE | `/api/admin/pages/collections/:id` | Delete collection |

### Pages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/pages/pages` | List pages |
| GET | `/api/admin/pages/pages/:id` | Get page |
| POST | `/api/admin/pages/pages` | Create page |
| PUT | `/api/admin/pages/pages/:id` | Update page |
| DELETE | `/api/admin/pages/pages/:id` | Delete page |
| POST | `/api/admin/pages/pages/:id/publish` | Publish page |
| POST | `/api/admin/pages/pages/:id/unpublish` | Unpublish page |

### Metadata

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/pages/templates` | List available templates |
| GET | `/api/admin/pages/layouts` | List available layouts |
| GET | `/api/admin/pages/blocks` | List available block types |
| GET | `/api/admin/pages/blocks-schema` | Get merged blocks schema (base + BlockDefinitions) |

### Block Definitions (Registry)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/pages/block-definitions` | List block definitions |
| POST | `/api/admin/pages/block-definitions` | Create block definition |
| GET | `/api/admin/pages/block-definitions/:code` | Get block definition |
| PUT | `/api/admin/pages/block-definitions/:code` | Update block definition |
| DELETE | `/api/admin/pages/block-definitions/:code` | Delete block definition |

### Block Definitions AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/pages/ai/block-definitions/generate` | Generate a block definition proposal (JSON) |
| POST | `/api/admin/pages/ai/block-definitions/:code/propose` | Propose edits to an existing block definition (JSON) |

## Admin UI

Access the Page Builder admin at `[adminPath]/pages` (e.g., `/admin/pages`).

Features:
- List and search pages/collections
- Create, edit, delete pages and collections
- Publish/unpublish pages
- Configure SEO metadata
- Add custom CSS and JavaScript
- Manage templates and layouts via Virtual EJS (create/edit, history/rollback, AI vibe)
- Manage block definitions via DB registry (CRUD + AI proposal)
- Configure Blocks AI default provider/model (Blocks → Settings)

### Blocks AI settings

The Blocks registry AI endpoints use the centralized LLM defaults resolver.

Defaults resolve in this order:
1. Request body: `providerKey` / `model`
2. Centralized defaults:
   - System defaults: `llm.systemDefaults.pageBuilder.blocks.generate.{providerKey,model}` and `llm.systemDefaults.pageBuilder.blocks.propose.{providerKey,model}`
   - Global defaults: `llm.defaults.{providerKey,model}`
3. Legacy fallback:
   - `pageBuilder.blocks.ai.providerKey`
   - `pageBuilder.blocks.ai.model`
4. Environment fallback (last resort):
   - `DEFAULT_LLM_PROVIDER_KEY`
   - `DEFAULT_LLM_MODEL`
5. Hard default model: `x-ai/grok-code-fast-1`

The Page Builder admin UI exposes these under:
- Blocks → Settings

## Multi-Tenant Support

Pages support multi-tenancy via `tenantId` and `isGlobal` fields:

- **Global pages** (`isGlobal: true`): Visible to all tenants
- **Tenant pages** (`isGlobal: false`): Only visible to the specific tenant

The page router checks both global pages and tenant-specific pages when resolving URLs.

## Virtual EJS Integration

Page templates, layouts, and blocks are rendered using the Virtual EJS system, enabling:

- **Runtime customization**: Override any template via database
- **Version history**: Track changes with rollback capability
- **AI-assisted editing**: Use the vibe edit feature for template modifications

Templates are resolved from:
1. Database override (if enabled)
2. Filesystem (`views/pages/...`)

Template/layout discovery:
- `/api/admin/pages/templates` and `/api/admin/pages/layouts` include both:
  - built-in defaults
  - DB-backed Virtual EJS files created under `pages/templates/*.ejs` and `pages/layouts/*.ejs`

Block templates:
- Blocks are included by `block.type` and resolve as `pages/blocks/<type>.ejs`.
- Templates can be overridden in the database via Virtual EJS using the same path:
  - `pages/blocks/<type>.ejs`
- The Page Builder admin UI (Blocks tab) provides a Template action to open the Virtual EJS editor for the block.

## Security

- Page editing requires admin authentication (`basicAuth`)
- Custom JS is treated as trusted admin-authored code
- EJS templates have full server-side execution capability
- Consider CSP headers for public-facing pages with custom JS

## File Structure

```
views/pages/
├── runtime/
│   └── page.ejs          # Entry point for page rendering
├── layouts/
│   ├── default.ejs       # Standard layout
│   ├── minimal.ejs       # Minimal layout
│   └── sidebar.ejs       # Sidebar layout
├── templates/
│   ├── default.ejs       # Default template
│   ├── landing.ejs       # Landing page template
│   ├── article.ejs       # Article template
│   └── listing.ejs       # Listing template
├── partials/
│   ├── header.ejs        # Site header
│   ├── footer.ejs        # Site footer
│   └── sidebar.ejs       # Sidebar navigation
└── blocks/
    ├── hero.ejs          # Hero block
    ├── text.ejs          # Text block
    ├── image.ejs         # Image block
    ├── cta.ejs           # CTA block
    ├── features.ejs      # Features grid
    ├── testimonials.ejs  # Testimonials
    ├── faq.ejs           # FAQ accordion
    ├── contact.ejs       # Contact form
    └── html.ejs          # Custom HTML
```

## Source Files

- `src/models/Page.js` - Page model
- `src/models/PageCollection.js` - Collection model
- `src/services/pages.service.js` - Page service (routing, rendering, validation)
- `src/controllers/adminPages.controller.js` - Admin API controller
- `src/routes/adminPages.routes.js` - Admin API routes
- `src/routes/pages.routes.js` - Public page router
- `views/admin-pages.ejs` - Admin UI
