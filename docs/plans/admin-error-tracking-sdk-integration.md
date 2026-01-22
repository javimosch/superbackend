# Plan: Integrate Browser Error Tracking SDK into SuperBackend Admin Pages

## Goal
Enable the SuperBackend-admin UI (starting with `views/admin-dashboard.ejs`) to automatically load and initialize the browser error tracking SDK so:

- Admin UI JS errors are captured and visible under `/admin/errors`.
- The integration is **safe by default** (can be disabled, does not spam, avoids leaking secrets).
- It works with both build globals:
  - `window.superbackendErrorTrackingEmbed` (SDK-package build)
  - `window.saasbackendErrorTrackingEmbed` (legacy/root build)

## Current State (codebase)

### Admin dashboard architecture
- `views/admin-dashboard.ejs` is a Vue 3 SPA shell.
- It renders admin modules inside **iframes** (`<iframe :src="baseUrl + tab.path">`).
- Keyboard shortcuts are coordinated via `postMessage`.

### SDK delivery
- SDK is served from backend route: `GET /api/error-tracking/browser-sdk` (see `src/routes/errorTracking.routes.js`).
- This returns `sdk/error-tracking/browser/dist/embed.iife.js`.
- The SDK embed currently attaches a client to `window.superbackend.errorTracking` and also to legacy `window.saasbackend.errorTracking` (with deprecation warnings).

### Backend ingest endpoint
- Browser SDK posts to `endpoint: '/api/log/error'` by default (implemented under `src/routes/log.routes.js` and `src/services/errorLogger.js`).

## Key Design Consideration: parent vs iframe capture
Because the dashboard is a shell that embeds content in iframes:

- Initializing the SDK only in `admin-dashboard.ejs` (parent) will capture:
  - errors in the parent page JS (Vue shell, tab persistence, palette, etc.)
  - **NOT** errors happening inside iframe documents (different `window`)

- Initializing the SDK only inside each iframe page will capture:
  - errors from each admin module page
  - but not errors in the parent shell

### Recommended approach
- Initialize SDK in **both**:
  - the dashboard shell (`views/admin-dashboard.ejs`)
  - each iframe-rendered admin page that contains client-side JS (e.g. `admin-errors.ejs`, `admin-assets.ejs`, etc.)

To keep effort manageable, implement in phases:

- Phase A: Integrate in `admin-dashboard.ejs` (parent shell) + a small number of high-value pages (starting with `admin-errors.ejs` as example).
- Phase B: Roll out to all admin pages that include inline JS.

## Proposed Integration Strategy

### 1) Loading the SDK
- Add a `<script src="<%= baseUrl %>/api/error-tracking/browser-sdk"></script>` tag in admin pages.
- Prefer adding it:
  - near the bottom of `<body>` before other inline scripts that might throw, OR
  - in `<head>` with `defer` (if we want earliest capture while not blocking render).

### 2) Initialization
After the SDK script loads, configure and initialize:

- Resolve the global in a resilient way:
  - prefer `window.superbackend.errorTracking`
  - fall back to `window.saasbackend.errorTracking` (legacy)

- Configure:
  - `endpoint`: likely `"<%= baseUrl %>/api/log/error"` (ensure it includes baseUrl for middleware mounting)
  - `headers` / `getAuthHeader`: see Auth Strategy below
  - sampling/rate options (defaults exist in SDK; keep conservative)

- Call `init()` once.

### 3) Auth / user identification strategy
We need a consistent approach for associating frontend errors with an actor.

Current admin pages are protected with `basicAuth` (server-side), and browser fetches to `/api/log/error` may or may not need extra auth.

Options:

- Option A (simplest): **No auth header**
  - Pros: easy
  - Cons: may be treated as anon; if the endpoint later requires auth, the SDK stops working

- Option B: Use a dedicated **admin error tracking token**
  - On page render, inject a short-lived token into the HTML and configure `getAuthHeader()`
  - Pros: explicit identity, future-proof
  - Cons: requires backend work to mint/validate token

- Option C: If `/api/log/error` already accepts basic-auth session/cookies, rely on browser sending cookies
  - Pros: no token plumbing
  - Cons: depends on deployment and cookie policy; basic auth may not be present for XHR in all scenarios

**Plan preference:** Start with Option A for the dashboard shell (capture at least), and add Option B if you want user attribution.

### 4) Minimize noise / protect privacy
- Keep SDK `maxErrorsPerSession` default (50) and `debounceMs` (1000).
- Avoid sending secrets:
  - ensure SDK does not include sensitive headers by default
  - if we add auth header, keep it short-lived

### 5) Iframe coordination (future enhancement)
If we want a single place to configure identity/options:

- Parent initializes SDK config and sends config to iframes via `postMessage`.
- Iframes initialize SDK and apply config received from parent.

This avoids duplicating configuration logic across many templates.

## Concrete File Changes (planned, not implemented)

### Phase A (minimum viable)
- Update `views/admin-dashboard.ejs`
  - Inject `<script src="<%= baseUrl %>/api/error-tracking/browser-sdk"></script>`
  - Add a small inline init block:
    - resolve `superbackend.errorTracking` / fallback to `saasbackend.errorTracking`
    - set endpoint to include `baseUrl`
    - call `init()`

- Update `views/admin-errors.ejs`
  - Add same SDK script tag + init (so that errors in this page itself are captured).

### Phase B (rollout)
- Add a shared partial (e.g. `views/partials/error-tracking-script.ejs`) included by all admin pages.
  - Contains the SDK script tag + init block.
  - Pages include it at the bottom.

## Validation Plan
- Open `/admin` and verify:
  - `window.superbackend?.errorTracking` exists
  - network calls go to `/api/log/error` on JS errors

- Force a JS error in:
  - parent shell (dashboard)
  - an iframe page

- Confirm error appears in `/admin/errors` and is attributed to `source: frontend`.

## Open Questions (need your answers before implementation)
1. **Scope**: Do you want SDK enabled on:
   - only `admin-dashboard.ejs` (shell)
   - all admin pages (including those loaded in iframes)
   - only selected pages

2. **Auth**: Should browser error reports be:
   - anonymous
   - authenticated/attributed (requires token/header strategy)

3. **Endpoint baseUrl**: Are these pages always mounted under a base path (middleware mode) such that client should post to `"<%= baseUrl %>/api/log/error"` instead of `"/api/log/error"`?

4. **Sampling**: Keep default sample rate 100% for admin pages, or reduce (e.g. 25%)?

5. **Environment gating**: Should this run only in production, or also in local/dev?
