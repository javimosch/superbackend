# Usage (current implementation)

## 1) Build and serve SDK
- Build bundle:
  - `npm run build:sdk:superdemos:browser`
- SDK file served from:
  - `/public/sdk/superdemos.iife.js`

## 2) Create project and demo (Admin UI)
- Open:
  - `${adminPath}/superdemos` (typically `/admin/superdemos`)
- In **Projects**:
  - Create a project (public or private)
  - If private, copy the generated API key immediately
- In **Demos**:
  - Create a demo for the selected project
  - Optionally set `startUrlPattern`

## 3) Author steps with live selector capture
- In **Authoring session**:
  - Enter target app URL and click **Start authoring**
  - Open generated `connectUrl` in a new tab
- In target app (SDK author mode):
  - Hover/click elements to send selections over WebSocket
- Back in Admin:
  - Use **Add step** from selected element
  - Edit message, placement, and advance behavior
  - Save steps
  - Optionally click **Use QA page as target** for quick E2E verification (`/superdemos-qa.html`)

## 4) Publish demo
- Click **Publish** in the selected demo panel
- Demo status changes to `published` and `publishedVersion` increments

## 5) Embed live mode in target app
- Add snippet:
  - `<script src=\"<apiUrl>/public/sdk/superdemos.iife.js\"></script>`
  - `SuperDemos.init({ projectId, apiUrl, apiKey, mode: 'live' })`
- For private projects provide `apiKey`; for public projects omit or pass `null`
- SDK auto-fetches published demos and plays first matching demo for current URL

## 5.1) A-to-Z QA flow (Admin UI + demo page)
- Open Admin SuperDemos and create/select project + demo
- In Authoring panel:
  - Click **Use QA page as target**
  - Click **Start authoring**
  - Open generated `connectUrl`
- In QA page (`/superdemos-qa.html`):
  - Click elements in fake app panel to emit selectors
  - Back in Admin, click **Add step**, edit message, **Save**, and **Preview**
- Publish demo in Admin
- In QA page:
  - Set `projectId`, `apiUrl`, and optional private `apiKey`
  - Click **Init SuperDemos** in `live` mode
  - Verify bubble sequence runs on fake app elements
- Use **Reset seen flags** on QA page to replay same published version

## 6) Current behavior notes
- Seen gating:
  - Demo is shown once per `{projectId, demoId, version, anonId}` via localStorage
  - Seen state is now recorded after playback completes
- Author mode:
  - Triggered by `sd_session` + `sd_token` query params (or `sd_author=1`)
  - Sends `hover`, `select`, and initial `location` message to Admin WS peer
- Global SDK aliases available:
  - `window.SuperDemos`
  - `window.superDemos`

---

# Implementation state (as of 2026-02-26)

## What exists (implemented)

### Models & persistence
- `src/models/SuperDemoProject.js` — projects with `projectId`, `name`, `isPublic`, `apiKeyHash`, `allowedOrigins`, `isActive`
- `src/models/SuperDemo.js` — demos per project with `status`, `publishedVersion`, `startUrlPattern`
- `src/models/SuperDemoStep.js` — steps per demo with `order`, `selector`, `message`, `placement`, `advance`, `waitFor`

### Admin API
- `src/routes/adminSuperDemos.routes.js` + `src/controllers/adminSuperDemos.controller.js`
  - Projects: CRUD, key rotation
  - Demos: create, update, publish
  - Steps: list, replace (order-based bulk)
  - Authoring sessions: create, delete

### Public API (SDK live mode)
- `src/routes/superDemos.routes.js` + `src/controllers/superDemosPublic.controller.js`
  - `/api/superdemos/projects/:projectId/demos/published` — list published demos (optional URL filter)
  - `/api/superdemos/demos/:demoId/definition` — fetch definition + steps
  - Project privacy enforced: public projects no key, private requires `x-project-key`

### WebSocket authoring broker
- `src/services/superDemosWs.service.js`
  - Endpoint: `/api/superdemos/ws?sessionId=...&role=...&token=...`
  - WS upgrade validation: session lookup, token verification, origin allowlist (if configured)
  - Pairing per session: adminWs + sdkWs, JSON relay between peers, `peer_status` system events
- `src/services/superDemosAuthoringSessions.service.js`
  - In-memory session registry with TTL (10 min)
  - API key generated once per session, scoped to `projectId`, `demoId`

### Admin UI
- `views/admin-superdemos.ejs` + `public/js/admin-superdemos.js`
- Route: `${adminPath}/superdemos` (guarded by `requireModuleAccessWithIframe('superdemos', 'read')`)
- Nav item added to dashboard
- RBAC rights: `admin_panel__superdemos:read` and `admin_panel__superdemos:write`

### Browser SDK
- Source: `sdk/superdemos/browser/src/index.js` (built to `public/sdk/superdemos.iife.js`)
- Build script in `package.json`: `build:sdk:superdemos:browser`
- Embed: serves from `/public/sdk/superdemos.iife.js`

### Integration with middleware
- `src/middleware.js`:
  - `attachSuperDemosWebsocketServer(server)` called in `router.attachWs`
  - `GET ${adminPath}/superdemos` route rendering admin EJS page

### Fixed issues during implementation
- `src/middleware.js`: added missing `isBasicAuthSuperAdmin` import from `src/middleware/rbac.js` (was causing `ReferenceError` in module-access checks)

## Test coverage
- `src/services/superDemosAuthoringSessions.service.test.js` — TTL, token validation, session lifecycle
- `src/services/superDemosWs.service.test.js` — WS upgrade validation, peer relay, origin allowlist enforcement
- `src/controllers/superDemosPublic.controller.test.js` — public vs private project auth, demo definition retrieval
- `src/controllers/superDemos.flow.smoke.test.js` — end-to-end flow: create private project → demo → steps → publish → fetch definition (with project key)

All SuperDemos tests passing (11/11).

## Gaps / Not yet implemented (v1)
- Browser SDK runtime code not yet wired (source exists at `sdk/superdemos/browser/src/index.js`, but author/live playback logic not implemented)
- Admin UI client-side JS not yet populated (view scaffold exists, but interactive flows missing)
- No route-level HTTP integration tests (`supertest`) yet (only controller-level)
- Manual verification steps not yet performed (authoring session in browser, live demo playback)

## Rollout progress
- ✅ Phase 1 (MVP authoring plumbing): models, admin APIs, authoring session registry, WS relay, scaffold for Admin UI — done
- ⚠️ Phase 2 (MVP live demos): public endpoints done, SDK playback not yet wired

---

# Problem statement
Build a system (“SuperDemos”) to create and run interactive, step-by-step UI demos on external apps/websites via a lightweight browser SDK.
Authoring must be fast and compatible with apps that cannot be iframed, so authoring should work in a new window/tab.
End-users should be tracked with localStorage-based anonymous identity (no required login).
# Current state (relevant repo primitives)
WebSocket attachment pattern exists via `ws` and Node `upgrade` handlers (examples: `src/services/terminalsWs.service.js`, `src/services/experimentsWs.service.js`).
Admin modules follow a consistent pattern: EJS page route in `src/middleware.js` + admin API routes under `/api/admin/*` + static JS under `public/js/*`.
A browser SDK build pipeline already exists using esbuild and is served from `/public/sdk/*` (see `sdk/ui-components/browser/src/index.js` and `package.json` script `build:sdk:ui-components:browser`).
There is an existing “Projects + API key” pattern with Mongo models + public manifest endpoints (see UI Components: `src/models/UiComponentProject.js`, `src/controllers/uiComponentsPublic.controller.js`).
# Goals
Enable admins to:
Create projects per website/app, record demos as ordered steps with messages bound to DOM elements, and publish demos.
Run a live authoring session where the SDK (inside the external app) can:
Inspect the DOM, compute selectors, and send element selection metadata over WS to the Admin UI.
Enable end-users to:
Automatically see a published demo in “live mode” based on targeting rules and a localStorage anon id.
# Non-goals (v1)
Full DOM tree browsing/remote rendering in the Admin UI (v1 will rely on SDK-side inspector and metadata events).
Cross-frame / iframe authoring support (explicitly out of scope; use new window).
Complex experiment-style analytics and goal tracking (can be added later).
# Proposed architecture
## Components
1) Browser SDK (SuperDemos)
Runs in the external app and supports two modes:
Author mode: adds an inspector overlay, emits hover/select events and can preview bubbles.
Live mode: fetches published demos and plays them for end users.
2) WebSocket relay (“authoring broker”)
A WS service in SuperBackend that pairs two clients per authoring session:
Admin UI client connection.
SDK client connection (cross-origin).
The server relays messages between both parties.
3) Admin module “SuperDemos”
An admin page under `${adminPath}/superdemos` to:
Manage projects, demos, steps.
Start/stop authoring sessions.
Display incoming element selection metadata.
Publish demos.
## Why this approach
Because we cannot iframe external apps, the SDK must be the component that reads the DOM.
The Admin UI remains same-origin to the backend and only needs to receive selection metadata over WS.
# Data model (Mongo)
## SuperDemoProject
Collection: `super_demo_projects`
Fields:
`projectId` (string, unique, e.g. `sdp_...`)
`name` (string)
`isPublic` (boolean)
`apiKeyHash` (string|null)
`allowedOrigins` (string[])
`isActive` (boolean)
Timestamps
## SuperDemo
Collection: `super_demos`
Fields:
`demoId` (string, unique, e.g. `demo_...`)
`projectId` (string, index)
`name` (string)
`status` (`draft`|`published`)
`publishedVersion` (number)
`targeting` (object, v1 minimal)
`startUrlPattern` (string|null)
Timestamps
## SuperDemoStep
Collection: `super_demo_steps`
Fields:
`demoId` (string, index)
`order` (number, index)
`selector` (string)
`selectorHints` (mixed/object, optional)
`message` (string)
`placement` (`top`|`bottom`|`left`|`right`|`auto`)
`advance` (object; v1 types: `manualNext`, `clickTarget`, `delayMs`)
`waitFor` (object; `timeoutMs`)
Timestamps
# Authentication & security
## Project access
For live mode and public demo retrieval:
Public projects: no key required.
Private projects: require `x-project-key` header.
Mirror the UI Components pattern (key generated once, stored as hash).
## Authoring sessions
Authoring requires a short-lived session token usable cross-origin.
Implementation (v1, simplest): in-memory session registry with TTL.
Admin creates session via authenticated admin API.
Backend returns `{ sessionId, token, connectUrl }`.
SDK connects WS with `sessionId` and `token`.
Admin UI connects WS with `sessionId` and `token` (or admin session cookie + a server-issued session-bound token).
Origin checks: if `allowedOrigins` is set for the project, validate the `Origin` header on the SDK WS upgrade.
# WebSocket API
## Endpoint
`/api/superdemos/ws?sessionId=...&role=admin|sdk&token=...`
## Session pairing
Each session holds:
`adminWs` (nullable)
`sdkWs` (nullable)
`createdAt`, `expiresAt`
`projectId`, `demoId` (optional)
## Message relay
Server relays JSON frames between `admin` and `sdk`.
Additionally, server emits system events:
`hello` on connect
`peer_status` when the other side connects/disconnects
`error` on invalid token/session
## Core message types (v1)
SDK -> Admin:
`hover` (selector + rect + hints)
`select` (selector + rect + hints)
`location` (url + title)
Admin -> SDK:
`set_mode` (`author` submodes like select/preview)
`preview_bubble` (message + selector)
`clear_preview`
# HTTP API surface
## Admin endpoints (session-auth)
Routes file: `src/routes/adminSuperDemos.routes.js`
`GET /api/admin/superdemos/projects`
`POST /api/admin/superdemos/projects`
`PUT /api/admin/superdemos/projects/:projectId`
`POST /api/admin/superdemos/projects/:projectId/rotate-key`
`GET /api/admin/superdemos/projects/:projectId/demos`
`POST /api/admin/superdemos/projects/:projectId/demos`
`GET /api/admin/superdemos/demos/:demoId`
`PUT /api/admin/superdemos/demos/:demoId`
`POST /api/admin/superdemos/demos/:demoId/publish`
`GET /api/admin/superdemos/demos/:demoId/steps`
`PUT /api/admin/superdemos/demos/:demoId/steps` (replace list, order-based)
`POST /api/admin/superdemos/authoring-sessions` (create `{ sessionId, token, connectUrl }`)
`DELETE /api/admin/superdemos/authoring-sessions/:sessionId`
## Public endpoints (SDK live mode)
Routes file: `src/routes/superDemos.routes.js`
`GET /api/superdemos/projects/:projectId/demos/published` (optionally filter by url)
`GET /api/superdemos/demos/:demoId/definition` (steps + metadata)
These should respect project privacy (`x-project-key`) like UI Components.
# Admin UI module
## Page route
Add `GET ${adminPath}/superdemos` in `src/middleware.js` rendering `views/admin-superdemos.ejs` and guarded by `requireModuleAccessWithIframe('superdemos', 'read')`.
Add nav item in `views/partials/dashboard/nav-items.ejs`.
Add RBAC rights in `src/utils/rbac/rightsRegistry.js`:
`admin_panel__superdemos:read`
`admin_panel__superdemos:write`
## UI behavior (v1)
Projects panel: create/select project, show API key on creation/rotation.
Demos panel: create/select demo, publish.
Steps panel: list/reorder, edit message/placement/advance.
Authoring panel:
Start session, show connect URL to open in new window.
Show live “selected element” updates coming from SDK via WS.
Button to “capture selected element into current step”.
# Browser SDK (SuperDemos)
## Build
Add new esbuild script in `package.json` similar to existing SDK builds:
Input: `sdk/superdemos/browser/src/index.js`
Output: `public/sdk/superdemos.iife.js`
Global: `SuperDemos` (and optionally alias `superDemos`).
## Identity (anon)
Generate and persist `anonId` in localStorage (e.g. key `superdemos.anonId`).
Include `anonId` in live-mode eventing/targeting decisions (v1 primarily local decision: “hasSeenDemo”).
## Live mode playback (v1)
Fetch published demo definition.
For each step:
Wait for selector to exist.
Scroll element into view.
Render a bubble anchored to element rect.
Advance based on `advance` rule.
Persist completion state in localStorage keyed by `{projectId,demoId,version,anonId}`.
## Author mode (v1)
Detect `sd_session` and `sd_token` query params.
Connect WS as role `sdk`.
Add overlay with hover highlight and click select.
On select: compute selector (v1: best-effort CSS path + stable attributes like `data-testid` if present) and send to admin.
Support preview bubble rendering when admin sends `preview_bubble`.
# Integration points (files to touch)
Server WS attachment: `src/middleware.js` (extend `router.attachWs` to also call `attachSuperDemosWebsocketServer(server)`).
New WS service: `src/services/superDemosWs.service.js`.
New routes/controllers/models under `src/routes`, `src/controllers`, `src/models`.
New admin view: `views/admin-superdemos.ejs` + static JS `public/js/admin-superdemos.js`.
New SDK: `sdk/superdemos/browser/src/index.js` + build output `public/sdk/superdemos.iife.js`.
# Rollout plan
Phase 1 (MVP authoring plumbing):
Implement projects/demos/steps persistence and publish flow.
Implement WS relay + authoring session registry.
Implement SDK author mode (inspector + WS connect).
Implement minimal admin UI to capture selector + message into steps.
Phase 2 (MVP live demos):
Implement public endpoints for published demo retrieval.
Implement SDK live mode playback + localStorage gating.
Add minimal targeting via `startUrlPattern`.
# Testing & verification
Add Jest tests for:
Authoring session registry TTL behavior (unit).
WS relay basics (connect admin+sdk, relay payload).
Public demo retrieval auth behavior for public vs private projects.
Manual verification:
Create project + demo + steps in admin.
Start authoring session, open external app with author params, select elements, save steps.
Publish demo.
Load external app in live mode and confirm the demo plays once per anonId.


## Auto-generated plan

Problem statement
Build a system (“SuperDemos”) to create and run interactive, step-by-step UI demos on external apps/websites via a lightweight browser SDK.
Authoring must be fast and compatible with apps that cannot be iframed, so authoring should work in a new window/tab.
End-users should be tracked with localStorage-based anonymous identity (no required login).
Current state (relevant repo primitives)
WebSocket attachment pattern exists via ws and Node upgrade handlers (examples: src/services/terminalsWs.service.js, src/services/experimentsWs.service.js).
Admin modules follow a consistent pattern: EJS page route in src/middleware.js + admin API routes under /api/admin/* + static JS under public/js/*.
A browser SDK build pipeline already exists using esbuild and is served from /public/sdk/* (see sdk/ui-components/browser/src/index.js and package.json script build:sdk:ui-components:browser).
There is an existing “Projects + API key” pattern with Mongo models + public manifest endpoints (see UI Components: src/models/UiComponentProject.js, src/controllers/uiComponentsPublic.controller.js).
Goals
Enable admins to:
Create projects per website/app, record demos as ordered steps with messages bound to DOM elements, and publish demos.
Run a live authoring session where the SDK (inside the external app) can:
Inspect the DOM, compute selectors, and send element selection metadata over WS to the Admin UI.
Enable end-users to:
Automatically see a published demo in “live mode” based on targeting rules and a localStorage anon id.
Non-goals (v1)
Full DOM tree browsing/remote rendering in the Admin UI (v1 will rely on SDK-side inspector and metadata events).
Cross-frame / iframe authoring support (explicitly out of scope; use new window).
Complex experiment-style analytics and goal tracking (can be added later).
Proposed architecture
Components
1) Browser SDK (SuperDemos)
Runs in the external app and supports two modes:
Author mode: adds an inspector overlay, emits hover/select events and can preview bubbles.
Live mode: fetches published demos and plays them for end users.
2) WebSocket relay (“authoring broker”)
A WS service in SuperBackend that pairs two clients per authoring session:
Admin UI client connection.
SDK client connection (cross-origin).
The server relays messages between both parties.
3) Admin module “SuperDemos”
An admin page under ${adminPath}/superdemos to:
Manage projects, demos, steps.
Start/stop authoring sessions.
Display incoming element selection metadata.
Publish demos.
Why this approach
Because we cannot iframe external apps, the SDK must be the component that reads the DOM.
The Admin UI remains same-origin to the backend and only needs to receive selection metadata over WS.
Data model (Mongo)
SuperDemoProject
Collection: super_demo_projects
Fields:
projectId (string, unique, e.g. sdp_...)
name (string)
isPublic (boolean)
apiKeyHash (string|null)
allowedOrigins (string[])
isActive (boolean)
Timestamps
SuperDemo
Collection: super_demos
Fields:
demoId (string, unique, e.g. demo_...)
projectId (string, index)
name (string)
status (draft|published)
publishedVersion (number)
targeting (object, v1 minimal)
startUrlPattern (string|null)
Timestamps
SuperDemoStep
Collection: super_demo_steps
Fields:
demoId (string, index)
order (number, index)
selector (string)
selectorHints (mixed/object, optional)
message (string)
placement (top|bottom|left|right|auto)
advance (object; v1 types: manualNext, clickTarget, delayMs)
waitFor (object; timeoutMs)
Timestamps
Authentication & security
Project access
For live mode and public demo retrieval:
Public projects: no key required.
Private projects: require x-project-key header.
Mirror the UI Components pattern (key generated once, stored as hash).
Authoring sessions
Authoring requires a short-lived session token usable cross-origin.
Implementation (v1, simplest): in-memory session registry with TTL.
Admin creates session via authenticated admin API.
Backend returns { sessionId, token, connectUrl }.
SDK connects WS with sessionId and token.
Admin UI connects WS with sessionId and token (or admin session cookie + a server-issued session-bound token).
Origin checks: if allowedOrigins is set for the project, validate the Origin header on the SDK WS upgrade.
WebSocket API
Endpoint
/api/superdemos/ws?sessionId=...&role=admin|sdk&token=...
Session pairing
Each session holds:
adminWs (nullable)
sdkWs (nullable)
createdAt, expiresAt
projectId, demoId (optional)
Message relay
Server relays JSON frames between admin and sdk.
Additionally, server emits system events:
hello on connect
peer_status when the other side connects/disconnects
error on invalid token/session
Core message types (v1)
SDK -> Admin:
hover (selector + rect + hints)
select (selector + rect + hints)
location (url + title)
Admin -> SDK:
set_mode (author submodes like select/preview)
preview_bubble (message + selector)
clear_preview
HTTP API surface
Admin endpoints (session-auth)
Routes file: src/routes/adminSuperDemos.routes.js
GET /api/admin/superdemos/projects
POST /api/admin/superdemos/projects
PUT /api/admin/superdemos/projects/:projectId
POST /api/admin/superdemos/projects/:projectId/rotate-key
GET /api/admin/superdemos/projects/:projectId/demos
POST /api/admin/superdemos/projects/:projectId/demos
GET /api/admin/superdemos/demos/:demoId
PUT /api/admin/superdemos/demos/:demoId
POST /api/admin/superdemos/demos/:demoId/publish
GET /api/admin/superdemos/demos/:demoId/steps
PUT /api/admin/superdemos/demos/:demoId/steps (replace list, order-based)
POST /api/admin/superdemos/authoring-sessions (create { sessionId, token, connectUrl })
DELETE /api/admin/superdemos/authoring-sessions/:sessionId
Public endpoints (SDK live mode)
Routes file: src/routes/superDemos.routes.js
GET /api/superdemos/projects/:projectId/demos/published (optionally filter by url)
GET /api/superdemos/demos/:demoId/definition (steps + metadata)
These should respect project privacy (x-project-key) like UI Components.
Admin UI module
Page route
Add GET ${adminPath}/superdemos in src/middleware.js rendering views/admin-superdemos.ejs and guarded by requireModuleAccessWithIframe('superdemos', 'read').
Add nav item in views/partials/dashboard/nav-items.ejs.
Add RBAC rights in src/utils/rbac/rightsRegistry.js:
admin_panel__superdemos:read
admin_panel__superdemos:write
UI behavior (v1)
Projects panel: create/select project, show API key on creation/rotation.
Demos panel: create/select demo, publish.
Steps panel: list/reorder, edit message/placement/advance.
Authoring panel:
Start session, show connect URL to open in new window.
Show live “selected element” updates coming from SDK via WS.
Button to “capture selected element into current step”.
Browser SDK (SuperDemos)
Build
Add new esbuild script in package.json similar to existing SDK builds:
Input: sdk/superdemos/browser/src/index.js
Output: public/sdk/superdemos.iife.js
Global: SuperDemos (and optionally alias superDemos).
Identity (anon)
Generate and persist anonId in localStorage (e.g. key superdemos.anonId).
Include anonId in live-mode eventing/targeting decisions (v1 primarily local decision: “hasSeenDemo”).
Live mode playback (v1)
Fetch published demo definition.
For each step:
Wait for selector to exist.
Scroll element into view.
Render a bubble anchored to element rect.
Advance based on advance rule.
Persist completion state in localStorage keyed by {projectId,demoId,version,anonId}.
Author mode (v1)
Detect sd_session and sd_token query params.
Connect WS as role sdk.
Add overlay with hover highlight and click select.
On select: compute selector (v1: best-effort CSS path + stable attributes like data-testid if present) and send to admin.
Support preview bubble rendering when admin sends preview_bubble.
Integration points (files to touch)
Server WS attachment: src/middleware.js (extend router.attachWs to also call attachSuperDemosWebsocketServer(server)).
New WS service: src/services/superDemosWs.service.js.
New routes/controllers/models under src/routes, src/controllers, src/models.
New admin view: views/admin-superdemos.ejs + static JS public/js/admin-superdemos.js.
New SDK: sdk/superdemos/browser/src/index.js + build output public/sdk/superdemos.iife.js.
Rollout plan
Phase 1 (MVP authoring plumbing):
Implement projects/demos/steps persistence and publish flow.
Implement WS relay + authoring session registry.
Implement SDK author mode (inspector + WS connect).
Implement minimal admin UI to capture selector + message into steps.
Phase 2 (MVP live demos):
Implement public endpoints for published demo retrieval.
Implement SDK live mode playback + localStorage gating.
Add minimal targeting via startUrlPattern.
Testing & verification
Add Jest tests for:
Authoring session registry TTL behavior (unit).
WS relay basics (connect admin+sdk, relay payload).
Public demo retrieval auth behavior for public vs private projects.
Manual verification:
Create project + demo + steps in admin.
Start authoring session, open external app with author params, select elements, save steps.
Publish demo.
Load external app in live mode and confirm the demo plays once per anonId.