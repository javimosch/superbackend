# UI Components system plan (ref-saasbackend)

## Goals
- Enable rapid creation and reuse of **self-contained UI Components** (HTML + JS) such as `toast`, `alert`, `icons`, etc.
- Allow simple external website integration via the existing browser SDK style: `<script>` + `init(...)`.
- Make components **project-scoped** (a project “enables” a set of components).
- Support **public/private projects**:
  - Public: components can be fetched by `projectId` without a secret.
  - Private: requires a **project API key** provided in SDK init.
- Provide **LLM-friendly endpoints** (token-based auth managed in admin UI) for:
  - Listing projects/components
  - CRUD UI components
  - Assigning/unassigning components to projects
  - Getting component details + usage

## Non-goals (v1)
- Full visual component builder (drag/drop)
- Component marketplace / paid distribution
- Per-end-user personalization or A/B testing

## Existing ref-saasbackend primitives to reuse
- **Admin auth:** basic auth middleware (`src/middleware/auth.js`).
- **Admin shell UI:** `views/admin-dashboard.ejs` (Vue) uses `views/partials/dashboard/nav-items.ejs` to define modules.

## Architecture overview
### High-level data flow
- **Admin UI** creates:
  - Projects (`UiComponentProject`)
  - UI Components (`UiComponent`)
  - Project↔Component assignments (`UiComponentProjectComponent`)
  - Project secrets (API key) and public/private flag
  - Headless API token for LLMs (existing headless token system)
- **Browser SDK init** calls backend:
  - Fetch manifest of enabled components for the given project
  - Inject component HTML into inert containers (`<template>` or hidden container)
  - Register JS handlers into `window.uiCmp` API

## Data model (Mongo/Mongoose)
Introduce 3 new models (collections):

### 1) `UiComponent`
Represents a reusable component definition.
- **Required fields**
  - `code` (string, unique): stable identifier used by SDK: e.g. `toast`, `alert`.
  - `name` (string): human-friendly.
- **Definition fields**
  - `html` (string): markup inserted via `<template>`.
  - `js` (string): component runtime script.
  - `css` (string, optional): either injected as `<style>` (scoped) or attached to shadow root (see SDK section).
  - `api` (object, optional): describes exposed functions (for usage docs), e.g. `{ methods: ['show', 'hide'], argsSchema: ... }`.
  - `usageMarkdown` (string, optional): docs shown to humans/LLMs.
- **Meta**
  - `version` (number or string): helps caching/invalidation.
  - `isActive` (boolean)
  - timestamps

### 2) `UiComponentProject`
Represents an external integrator project.
- **Required fields**
  - `projectId` (string, unique): public identifier used by SDK init. Enforced format: `^prj_[a-z0-9]{8,32}$`.
  - `name` (string)
- **Access fields**
  - `isPublic` (boolean)
  - `apiKeyHash` (string | null): stored hashed; only shown once when generated.
  - `allowedOrigins` (array<string>, optional): for CORS checks/soft enforcement.
- **Meta**
  - `isActive` (boolean)
  - timestamps

### 3) `UiComponentProjectComponent`
Assignment join table.
- `projectId` (ref or string)
- `componentCode` (ref or string)
- `enabled` (boolean)
- timestamps

#### Indexes
- `UiComponent.code` unique
- `UiComponentProject.projectId` unique
- Compound index on (`projectId`, `componentCode`) unique for assignment.

## Security model
### 1) Browser delivery (public/private)
- Requests include `projectId` always.
- If project is **public**: manifest/components accessible without secret.
- If project is **private**:
  - SDK must send `x-project-key` (plaintext)
  - Server verifies using `apiKeyHash`.
  - `x-project-key` is required on every fetch (manifest and per-component fetch).

### 2) LLM-friendly endpoints
Expose LLM-friendly endpoints as standard JSON APIs protected by the same **basic auth** used by the admin UI.

Rationale: keep the system simpler and align with the existing admin security model.

### 3) Admin UI
Still basic-auth protected.

## API surface
### Browser-facing endpoints (for SDK)
All responses should be JSON; JS/CSS delivered as plain strings in JSON for v1.

1) **Get project manifest**
- `GET /api/ui-components/projects/:projectId/manifest`
- Auth:
  - Public project: none
  - Private project: `x-project-key`
- Response:
  - `project: { projectId, isPublic, ... }`
  - `components: [{ code, name, version, html, js, css }]`
- Notes:
  - Include `version` for caching.
  - Optional: support `If-None-Match` with ETag derived from versions.

2) (Optional) **Get single component**
- `GET /api/ui-components/projects/:projectId/components/:code`
- Useful for lazy loading.

For private projects, this endpoint requires `x-project-key` as well.

### LLM-friendly endpoints (basic auth)
All of the following are protected by basic auth.

#### Projects
- `GET /api/llm/ui/projects`
- `POST /api/llm/ui/projects` (create)
- `GET /api/llm/ui/projects/:projectId`
- `PUT /api/llm/ui/projects/:projectId` (update fields like `isPublic`, `name`, regenerate key)
- `DELETE /api/llm/ui/projects/:projectId`

#### Components
- `GET /api/llm/ui/components`
- `POST /api/llm/ui/components`
- `GET /api/llm/ui/components/:code`
- `PUT /api/llm/ui/components/:code`
- `DELETE /api/llm/ui/components/:code`

#### Assignments
- `POST /api/llm/ui/projects/:projectId/components/:code` (assign/enable)
- `DELETE /api/llm/ui/projects/:projectId/components/:code` (unassign)
- `GET /api/llm/ui/projects/:projectId/components` (list enabled)

#### Component usage/details
- `GET /api/llm/ui/components/:code/usage`
  - returns `usageMarkdown`, `api`, plus an example snippet.

### Error semantics
Follow existing patterns:
- `400` validation
- `401` invalid token/key
- `403` insufficient permissions
- `404` missing resource

## SDK contract and runtime plan
### Desired developer experience
```html
<script src="https://YOUR_DOMAIN/sdk/superinsights.js"></script>
<script>
  // example, exact API name to decide
  uiCmp.init({ projectId: 'prj_123', apiKey: 'uk_...' });
  uiCmp.toast.show({ title: 'Saved', message: 'All good' });
</script>
```

### Where to host SDK
Two options:
- **Option A (recommended):** add a new build artifact under `ref-saasbackend/sdk/ui-components/browser/dist/...` and serve it from the backend.
- **Option B:** extend existing `public/sdk/superinsights.js` in the main project repo with a new module.

This plan assumes **Option A** to keep the subproject self-contained.

### Injection & scoping approach
For each component in manifest:
- Create a `<template id="ui-cmp-${code}">` and set its `innerHTML = html`.
- Create a container root `div` per component instance.
- When instantiating:
  - Clone template: `const fragment = template.content.cloneNode(true)`
  - Append to an instance root element.
  - Provide `templateRootEl` to the JS runtime so queries are scoped:
    - `const templateRootEl = instanceRootEl;`
    - Encourage `templateRootEl.querySelector(...)`
- Execute component JS in a scoped wrapper function:
  - `new Function('api', 'templateRootEl', 'props', jsCode)`
  - returns an object of methods to attach to `uiCmp[code]`.

### Global API shape
- `window.uiCmp`
- `window.uiComponents` alias
- `uiCmp.init({ projectId, apiKey, apiUrl? })`
- After init:
  - `uiCmp.toast.show(...)`
  - `uiCmp.toast.hide(...)`

### CSS isolation (configurable)
Support both:
- Shadow DOM (strong isolation)
- Scoped `<style>` injection (simpler)

The choice is controlled by an SDK init option (exact name to be implemented), with a sensible default.

### Versioning & caching
- Manifest includes `{ code, version }`.
- SDK caches last manifest in `localStorage` by `projectId` + `apiUrl`.
- Cache invalidation when `version` changes.

## Admin UI plan (ref-saasbackend)
### Add dashboard module entry
Update `views/partials/dashboard/nav-items.ejs`:
- Add a new section or add into `Content & Config`:
  - `{ id: 'ui-components', label: 'UI Components', path: adminPath + '/ui-components', icon: 'ti-components' }`
  - Add `{ id: 'ui-projects', ... }` if you want split views.

### Add admin page(s)
Create new EJS view(s):
- `views/admin-ui-components.ejs` (single page to manage both Projects + Components + Assignments)

Recommended UI sections inside the page:
- **Projects panel**
  - list/search projects
  - create project
  - toggle public/private
  - rotate API key (show plaintext once)
  - copy “integration snippet”
- **Components panel**
  - list/search components
  - create/edit component: code, name, html/js/css, usageMarkdown
  - quick validation (basic linting / try-catch preview)
- **Assignments panel**
  - select a project
  - enable/disable components

### Admin API routes
Add a new router under `/api/admin/ui-components` protected by basic auth.
- Projects CRUD + rotate key
- Components CRUD
- Assign/unassign

## Implementation milestones (for later)
1) **Data layer**
- Add Mongoose models + indexes.
- Add crypto helper for project API keys (hash + verify).

2) **Admin APIs**
- Add `/api/admin/ui-components/*` endpoints.
- Add audit logging hooks if desired.

3) **Browser delivery API**
- Add `/api/ui-components/projects/:projectId/manifest`.
- Add CORS + key verification.

4) **SDK**
- Build iife bundle that injects `window.uiCmp`.
- Implement init + manifest fetch + caching.

5) **Admin UI**
- Add dashboard nav item.
- Add `admin-ui-components.ejs` with Vue for CRUD.

## Open questions to lock in
1) **Component isolation:** locked-in as configurable (Shadow DOM or scoped `<style>`).
2) **SDK naming:** locked-in as `window.uiCmp` plus `window.uiComponents` alias.
3) **Project identifier format:** locked-in as enforced `^prj_[a-z0-9]{8,32}$`.
4) **Private project access:** locked-in as API key required for manifest and every component fetch.
5) **LLM endpoints auth:** locked-in as basic-auth protected endpoints (no special token system).
6) **Hosting:** pending (default remains fully inside `ref-saasbackend`).
