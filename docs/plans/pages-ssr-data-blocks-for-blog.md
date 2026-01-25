---
description: Add SSR-capable Pages blocks with server-side data loading to render blog posts SEO-friendly
---

# Design: SSR-capable Pages blocks (data loaders) for SEO-friendly blog rendering

## Goal
Enable admins to use the existing **Pages system** to render SEO-friendly pages where some blocks can retrieve data on the server (DB queries, service calls, or internal API calls) and render into HTML via EJS.

Primary target: **blog pages are served through the Pages system** (no hardcoded blog route), with pre-made templates/layouts to make setup easy.

## Current state (baseline)
### Pages routing + SSR
- `src/routes/pages.routes.js` intercepts `GET *`.
- It finds a `Page` via `pagesService.findPageByRoutePath()` and renders with `pagesService.renderPage()`.
- `renderPage()` uses `ejsVirtualService.renderToString()` and EJS templates under `views/pages/...`.

### Block rendering today
- Templates (e.g. `views/pages/templates/article.ejs`) loop blocks and do:
  - `include('../blocks/' + block.type + '.ejs', { block, page, pageContext, req })`
- Blocks are currently **pure presentational**. They only use `block.props`.

### Virtual EJS (reusable SSR primitive)
- `ejsVirtualService.renderToString()`:
  - Loads templates from FS or DB overrides
  - Preloads includes, provides safe include resolution
  - Caches templates
- This is already a solid SSR mechanism to reuse.

## Problem
To render blog posts with SEO-friendly SSR using Pages blocks, the block system needs a documented way to:
- Execute **server-side logic** to fetch data (DB/services) *during render*.
- Pass results into EJS templates safely.
- Keep this **secure** (avoid arbitrary code execution from DB content).

Additionally, we want a generic mechanism that is not blog-specific:
- “EJS Context Blocks” that act like edge functions (server-executed) and can load arbitrary context data.
- A **DB query block** to retrieve data for templates/blocks.

## Proposed approach
### A) Introduce “SSR data loaders” for blocks
Add a server-side step before EJS rendering:
1. Parse the page’s blocks.
2. For blocks that declare a server loader, execute it to compute `block.data`.
3. Render blocks with EJS passing both `block.props` and `block.data`.

Key idea: blocks may carry *configuration* for context loading, but **must not allow arbitrary JS execution** from DB content.

#### Block instance shape (runtime)
Existing:
```js
{ id, type, props }
```
Proposed runtime (not necessarily stored):
```js
{ id, type, props, data }
```

#### Block definition schema extensions (server metadata)
Extend the schema returned by `pagesService.getBlocksSchema()` (not necessarily persisted in Mongo) with an optional server section:
```js
blocks: {
  blog_post: {
    label: 'Blog post',
    fields: { /* props fields */ },
    server: {
      loaderKey: 'blog.postBySlug',
      cacheTtlSeconds: 30,
      // optional: required params, allowed contexts, etc
    }
  }
}
```

### B) Add “EJS Context Blocks” (generic)
Introduce a small set of block types whose responsibility is to **load data and attach it to render context**.

Conceptually:
- Context blocks run first.
- They produce named values in a shared context, e.g. `ctx.vars`.
- Presentation blocks can read from `ctx.vars` (and/or their own `block.data`).

Example intent:
- `ctx.vars.post` loaded by a blog loader
- `ctx.vars.latestPosts` loaded by a DB query loader
- `ctx.vars.product` loaded by a helper/service loader

Important: even if EJS itself can execute logic, the context blocks are the official way to access data so:
- we can enforce permissions and limits
- we can cache
- we can make AI-assisted authoring safe and predictable

### C) Loader registry (allowlist)
Create a registry in code, e.g. `src/services/pagesBlockLoaders.service.js`:
- Map `loaderKey` -> function `(ctx, props) => data`
- `ctx` includes `req`, `res`, `page`, `routePath`, `params`, and safe helpers.

Example loader:
- `blog.postBySlug`
  - resolve slug from:
    - URL params (preferred if we add a dedicated blog pages route)
    - or `req.path`
  - query `BlogPost` for `{ slug, status: published }` (draft behind auth)
  - return normalized post shape for rendering

Proposed generic loaders:
- `db.query`
  - execute a Mongo-like JSON query directly against Mongoose/models
  - return a JSON-safe result
- `service.invoke`
  - invoke an allowlisted helper/service function with JSON args
  - return JSON-safe result

Note on `db.query`: the admin takes responsibility for what models/fields are queried. We should still enforce platform-level safety limits (response size caps, maximum limit caps, timeouts) to prevent accidental abuse.

Guardrails direction: keep this intentionally minimal. Only a max execution time guard is required, and it should be optional/configurable per block.

Execution time config:
- Timeout values should be human-friendly (e.g. `250ms`, `5s`, `1m`).
- Default should be `30s`.
- Precedence should be:
  - GlobalSetting
  - env
  - default (`30s`)

### D) Data access strategy: helpers first, internal HTTP optional
Recommended: **call services/models directly** (no HTTP hop)
- Faster, simpler, easier to type and test
- Avoids auth duplication

Still allow internal API calls as a secondary option via a helper like:
- `ctx.fetchInternalJson(url, opts)`
  - automatically sets internal cron/admin auth if appropriate
  - enforces same-origin + allowlist

### E) Caching + request memoization
We want SSR to be fast and stable.

Proposed caching layers:
- **Per-request memoization**: cache loader results by key `(loaderKey + JSON(props) + route)` in a Map on `req`.
- **Short TTL in-memory cache** for safe public data (optional):
  - e.g. blog post by slug for 30s
  - invalidated on blog post update/publish

Caching should leverage the existing cache layer system:
- `src/services/cacheLayer.service.js`
- Context blocks can opt into caching by configuring:
  - a cache namespace (e.g. `pages:ssr`)
  - a cache key expression (based on route + params + query + session-derived values)
  - a TTL

### F) Security model
Hard requirement: avoid arbitrary JS execution from DB-configured blocks.

Rules:
- Only allowlisted loader keys can run.
- DB query is intentionally not allowlisted (admin responsibility), but we still need:
  - optional max execution time guard
  - basic sanitization around cache keys and context interpolation
- Loader key allowlist per environment (prod vs dev).
- Loaders must be explicit about:
  - which collections/models they touch
  - what query params they accept
  - max limits (e.g. listing max items)
- Draft preview behavior remains protected by `?draft=1` + `basicAuth` (similar to existing Pages).

Extra constraints for “DB query block”:
- sort/limit caps
- reject obviously invalid queries (non-object filter, etc)

### G) Rendering integration points
Add a server-side phase in `pagesService.renderPage()`:
- compute `resolvedBlocks = await resolveBlocksData(blocks, ctx)`
- pass `resolvedBlocks` to EJS instead of raw `page.blocks`

EJS templates remain mostly unchanged, but blocks gain access to `block.data`.

Additionally, pass a `pageContext` object into EJS:
- `pageContext.vars` (aggregated context from context blocks)
- `pageContext.helpers` (safe helpers exposed to EJS)

Context should include auth/session-derived values so `db.query` can depend on them:
- `pageContext.auth` (user id, org id, roles)
- `pageContext.session` (safe subset)

## Blog SSR design (using Pages)
### Target experiences
- **Blog post detail SSR**: `/blog/:slug`
- **Blog listing SSR**: `/blog` (optional)

### Routing
Blog serving is done through the Pages system.

Practical approach:
- Create a PageCollection `blog` (slug: `blog`).
- Use Pages routing + collection pathing so:
  - listing page at `/blog`
  - post pages at `/blog/<postSlug>`
- Pages can fetch `postSlug` from `req.path` and/or computed route info.

Hybrid direction:
- Use a dynamic post details page pattern for flexibility.
- Additionally, support materializing a Page per BlogPost (for admin editing, previews, and long-term flexibility).

### Suggested new blocks
- `blog_post` (detail)
  - `props`: which fields to show (cover image, author, date)
  - `data`: post object
- `blog_post_body`
  - `data`: `post.html` (or markdown -> html)
- `blog_post_meta`
  - `data`: computed SEO meta
- `blog_post_list`
  - `props`: limit, category, tag
  - `data`: list of posts

Additionally, generic blocks:
- `context.db_query`
  - returns and stores named data, e.g. `vars.latestPosts`
- `context.service_call`
  - returns and stores named data, e.g. `vars.product`

## Documentation needs (developer-facing)
We should document:
- How to author a block that needs server data:
  - declare `server.loaderKey`
  - expected `block.data` shape
- How to add a new loader (server code):
  - where the registry lives
  - what ctx contains
  - security constraints
- How to SSR blog posts:
  - recommended route strategy
  - recommended template/layout choices

## Open questions for lock-in
1) **Draft visibility rules**
- Should `?draft=1` allow rendering unpublished blog posts via Pages loaders behind basicAuth, similar to Pages draft mode?

2) **Blog markdown/html source of truth**
- BlogPost has both markdown and html in some flows—should SSR render:
  - stored `html`
  - or render markdown at request time
  - or render markdown at publish time only

3) **Admin authoring of templates**
- Should admins be able to override blog page templates via virtual EJS DB overrides, or should templates be FS-only for blog SSR?

4) **DB query block contract**
- What query language do you want admins/AI to configure?
  - a) constrained Mongo-like JSON (allowlisted operators)
  - b) a small DSL (safer, more work)
  - c) “query presets” (safest, less flexible)

5) **Permissions + multi-tenant**
- Should context blocks be allowed on public pages by default, or only for admins?
- For tenant-aware installs, should loaders automatically scope queries by `tenantId`?

6) **What should EJS be allowed to access?**
- Only `pageContext.vars` + `block.props`?
- Or also expose a limited `pageContext.helpers`?

7) **AI-assisted authoring**
- Should the “AI assistance” operate by generating:
  - block configurations (props + context block configs)
  - and/or virtual EJS overrides
  - and/or block definitions

## Updated decisions (locked in)
- DB query configuration uses Mongo-like JSON.
- No automatic allowlisting/scoping (admin responsibility).
- Context blocks allowed on public pages, with optional caching.
- Tenant scoping is manual (admin chooses).
- EJS can access `pageContext.vars` and `pageContext.helpers`.

Additional lock-ins:
- Guardrails are minimal: optional max execution time per context block.
- Interpolation should be AI-friendly (see Remaining questions #1).
- Cache keys should be hybrid (auto-derived with optional admin override).
- EJS helpers exposure is full helpers/services (powerful).
- Context blocks should be AI-generated, and admins need a way to test them in isolation before use.

Testing lock-in: we need all three ways to test:
- block-level test (single block)
- page-level test (context phase)
- API-driven test (block config + mock context)

## Looping / repeat directives (v-for-like)
We want a generic way to materialize “one DB item => one Page” patterns, but also generalize it to other use cases.

Idea: add a repeat directive at the page (or block) level, where a single Page definition can be rendered multiple times for different items.

Options:
1) **Repeat at the Page level**
- Add a `repeat` config to `Page`:
  - `repeat.source` references a context variable (e.g. `vars.posts`)
  - `repeat.as` defines the item variable name (e.g. `post`)
  - `repeat.route` defines how to build the route per item (e.g. `/blog/{{item.slug}}`)
- Rendering flow:
  - resolve context
  - select item by route
  - inject `pageContext.vars[repeat.as] = item`
  - render template

2) **Repeat as a special Context Block**
- A context block computes a list of “virtual pages” or “route bindings” that map route -> item.
- This keeps Page schema stable but adds a more complex resolver.

3) **Repeat inside the template**
- Keep pages static, but allow listing templates to loop over `vars.posts`.
- This solves listing pages but not “dynamic per item route”.

Recommended direction for dynamic per-item route: option (1), because it makes the routing + binding explicit and AI-friendly.

## Remaining questions
1) **Context interpolation syntax**
- How should a `db.query` block reference context values?
  - a) explicit templating: `{ "authorId": "{{pageContext.auth.userId}}" }`
  - b) JSONPath-like references: `{ "authorId": { "$ctx": "auth.userId" } }`
  - c) no interpolation; require the block to define a separate “params” object and reference it

Decision: prefer option **(b)** as the most AI-friendly and validation-friendly.

2) **Cache key design**
- Should cache keys be:
  - a) fully auto-derived from (pageId + blockId + props + resolved ctx vars)
  - b) explicitly provided by admin (more control)
  - c) hybrid (admin can override)

Decision: **(c)** hybrid.

3) **Max execution time guard**
- What should the default timeout be (if enabled), and should it be per-block or global?

Decision: guardrails only require max execution time (optional).

Lock-in: timeout accepts `250ms`/`5s`/`1m`, default `30s`, precedence GlobalSetting > env > default.

4) **Testing context blocks in isolation**
- Where should the “test” experience live?
  - a) admin UI action on a block instance: “Run block”
  - b) admin UI action on a page: “Run context phase”
  - c) admin API endpoint that accepts block config + mock context

Lock-in: implement all (a), (b), and (c).

5) **Materialized Pages per BlogPost**
- If we support generating a Page per BlogPost, define:
  - when it is created/updated (on publish? on save?)
  - whether admins are allowed to diverge the page blocks from the post template
  - how to handle slug changes

6) **Repeat directive lock-in**
- Where should repeat live?
  - a) page-level `repeat` config (recommended)
  - b) context-block-generated route bindings
  - c) something else

7) **Repeat selection strategy**
- For a request to `/blog/<slug>`, should the system:
  - a) load list, then find matching item (simple but potentially heavy)
  - b) run a dedicated resolver query for that slug (preferred)
  - c) allow both (list for sitemap/materialization, resolver for runtime)

8) **Page materialization vs dynamic rendering**
- When both exist for the same route, which wins?
  - a) materialized Page wins
  - b) dynamic repeat-page wins
  - c) configurable

9) **Helpers exposure boundary**
- Decision is to expose full helpers/services to EJS. Do we still want any explicit “do not expose” list (e.g. raw encryption helpers, token services)?

## Milestones
1. Add loader registry + block-data resolution pipeline (no blog yet). (DONE)
2. Add context blocks (DB query + service invoke) with allowlists + limits. (DONE)
3. Add pre-made blog templates/layouts + blog context blocks (listing + post detail). (PARTIAL: templates exist, blog-specific blocks are admin-authored via context blocks)
4. Add caching + invalidation hooks. (DONE: cacheLayer integration; invalidation is manual via key/ttl strategy)
5. Add documentation + examples + admin UX notes. (DONE)

## Final implementation (what shipped)

### Repeat pages (dynamic route serving)
Implemented in:
- `src/models/Page.js` (`repeat` field)
- `src/services/pages.service.js` (`findPageByRoutePath` repeat fallback)

Behavior:
- Concrete pages always win (exact slug match).
- Collection repeat fallback:
  - If `/collection/<slug>` does not match a concrete page, Pages will look for a repeat page in that collection.
  - Convention: repeat pages use slug `_`.
  - The request segment value is exposed via `page._params` (default key `slug`, configurable via `page.repeat.paramKey`).
- Root repeat fallback is disabled by default to avoid catching arbitrary routes.
  - Can be enabled only for the `_` page with `repeat.allowRoot=true`.

### EJS Context Blocks (SSR)
Implemented in:
- `src/services/pagesContext.service.js`
- Wired into `src/services/pages.service.js` (`renderPage`) to resolve context blocks then render only non-context blocks.

Block types:
- `context.db_query`
  - Executes a Mongo-like JSON query against a Mongoose model.
  - Supports `$ctx` interpolation in query objects.
  - Writes output into `pageContext.vars[assignTo]`.
- `context.service_invoke`
  - Invokes a function by path under `pageContext.helpers.*`.
  - Supports `$ctx` interpolation for args.
  - Writes output into `pageContext.vars[assignTo]`.

Context available:
- `pageContext.vars`
- `pageContext.params` (repeat params)
- `pageContext.query`
- `pageContext.auth` (currently derived from `req.user`)
- `pageContext.session` (safe subset of `req.session`)

Helpers exposure:
- Exposes most of `globalThis.superbackend.services`/`models` plus `mongoose`.
- Small denylist for high-leak probability services (locked decision).

### Caching
Integrated via `src/services/cacheLayer.service.js`:
- Context blocks can opt-in to caching via `props.cache`.
- Cache keys are hybrid:
  - auto-derived if not provided
  - admin-provided key supported (with `$ctx` interpolation)

### Timeouts (guardrails)
- Optional per block via `props.timeout.enabled`.
- Timeout values support `250ms`, `5s`, `1m`.
- Default timeout (when enabled but no value supplied): `30s`.
- Precedence:
  - GlobalSetting: `PAGES_CONTEXT_BLOCK_TIMEOUT`
  - env: `PAGES_CONTEXT_BLOCK_TIMEOUT`
  - default: `30s`

### EJS propagation
`pageContext` is passed through the runtime entry, layout, templates, and blocks:
- `views/pages/runtime/page.ejs`
- `views/pages/layouts/default.ejs`
- `views/pages/templates/*.ejs`

### Admin API + UI
Admin persistence:
- `repeat` is persisted through `src/controllers/adminPages.controller.js` create/update.

Testing endpoints (basicAuth protected):
- `POST /api/admin/pages/pages/:id/test-context`
- `POST /api/admin/pages/pages/:id/test-block`
- `POST /api/admin/pages/test-block`

Admin UI additions:
- Repeat JSON editor field in `views/admin-pages.ejs`.
- “Test Context” button to run the context phase and show a preview.
