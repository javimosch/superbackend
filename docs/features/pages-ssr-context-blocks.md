---
description: Pages repeat routing and SSR context blocks (db query + service invoke) with EJS pageContext
---

# Pages SSR Context Blocks

## Overview
The Pages system supports server-side rendering (SSR) using EJS templates and a page builder block array (`page.blocks`).

This feature adds:
- Page-level **repeat routing** for dynamic paths (e.g. `/blog/:slug`) using a single Page definition.
- Server-executed **context blocks** (`context.*`) that build a `pageContext` object for templates/blocks.
- Optional caching via the platform cache layer.
- Optional per-block max execution time guard.
- Admin tooling to test context blocks in isolation.

## Rendering pipeline
1. Pages routing finds a Page (or repeat Page) via `pagesService.findPageByRoutePath()`.
2. Before rendering, the server runs all `context.*` blocks.
3. The context phase produces `pageContext`.
4. The template phase renders only non-context blocks and passes `pageContext` into layouts/templates/blocks.

## Page repeat routing
### Purpose
Repeat routing allows a single Page to serve many request paths by extracting a route segment into params.

### Configuration
Repeat config lives on the Page document:
- `page.repeat.paramKey` (default: `slug`)
- `page.repeat.allowRoot` (default: `false`)

### Convention
Repeat pages typically use slug `_`.

### Matching behavior
- Concrete pages always win.
- If a concrete page does not exist for `/collection/<slug>`, the router will fall back to a repeat page inside the collection.
- Root-level repeat fallback is disabled by default and only enabled when `repeat.allowRoot=true`.

### Params
When a repeat page is used, the last path segment is exposed as:
- `page._params[paramKey]`
- Passed into `pageContext.params`.

## Context blocks
### Block types
#### `context.db_query`
Executes a Mongo-like query using Mongoose.

Common props:
- `model`: Mongoose model name
- `op`: `find` | `findOne` | `countDocuments`
- `filter`: JSON object
- `sort`: JSON object (optional)
- `select`: JSON (optional)
- `limit`: number (only for `find`)
- `assignTo`: string key under `pageContext.vars`

#### `context.service_invoke`
Invokes a server function via a path under `pageContext.helpers`.

Common props:
- `servicePath`: dotted path to a function, relative to `pageContext.helpers` (example: `services.i18n.translate`)
- `args`: JSON array or JSON value
- `assignTo`: string key under `pageContext.vars`

### `$ctx` interpolation
Context blocks support `$ctx` references to access runtime context:

Example:
```json
{
  "filter": {
    "slug": { "$ctx": "params.slug" }
  }
}
```

Available roots for `$ctx`:
- `vars.*`
- `params.*`
- `query.*`
- `auth.*`
- `session.*`
- `pageContext.*`

## pageContext object
`pageContext` is provided to EJS layouts/templates/blocks.

Properties:
- `pageContext.vars`: aggregated output of context blocks
- `pageContext.params`: repeat params
- `pageContext.query`: request query
- `pageContext.auth`: derived from `req.user` (if present)
- `pageContext.session`: safe subset of `req.session` (if present)
- `pageContext.helpers`:
  - includes platform services/models plus `mongoose`
  - excludes a small denylist of high-risk services

## Caching
Context blocks can opt into caching using the platform cache layer (`cacheLayer.service`).

Cache config lives under `block.props.cache`:
- `enabled`: boolean
- `namespace`: string (default: `pages:ssr`)
- `ttlSeconds`: number
- `key`: optional cache key (supports `$ctx` interpolation)

If no key is provided, an auto-derived key is used.

## Max execution time guard
Timeout config lives under `block.props.timeout`:
- `enabled`: boolean
- `value`: optional string duration (`250ms`, `5s`, `1m`)

Default timeout is `30s`.

Timeout precedence:
1. GlobalSetting `PAGES_CONTEXT_BLOCK_TIMEOUT`
2. env `PAGES_CONTEXT_BLOCK_TIMEOUT`
3. default `30s`

## Admin testing
Admin endpoints (basicAuth protected):
- `POST /api/admin/pages/pages/:id/test-context`
  - runs the full context phase for an existing page
- `POST /api/admin/pages/pages/:id/test-block`
  - runs a single supplied `context.*` block using a page as reference
- `POST /api/admin/pages/test-block`
  - runs a single supplied `context.*` block with mock context and no stored page

Admin UI:
- Pages editor exposes a Repeat JSON field.
- Pages editor includes a “Test Context” action.
