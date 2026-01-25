# Plan: Superbackend Rate Limiter System (configurable + metrics + admin UI)

## Goals

- Provide a **first-class rate limiter system** for Superbackend that:
  - Can be used **programmatically** (helpers) and as **Express middleware**.
  - Exposes **metrics APIs** for admin/observability.
  - Is **configurable at runtime** (admin can adjust rules without redeploy).
- Provide a **dedicated Admin UI module** reachable from the Admin Dashboard (`views/admin-dashboard.ejs` via `views/partials/dashboard/nav-items.ejs`).
  - Includes:
    - Metrics (sub-tab)
    - Usage documentation (collapsible section or sub-tab)
    - A rate limits table showing existing integration points where admin can adjust rules

## Current codebase constraints / existing systems to leverage

- Admin dashboard is a tabbed Vue UI that opens modules by `id` from `views/partials/dashboard/nav-items.ejs` and loads them into iframes.
- Existing storage patterns we should leverage:
  - **Global settings** (DB-backed via `GlobalSetting` model) + API routes in `src/routes/globalSettings.routes.js`.
  - **JSON configs system** (DB-backed via `JsonConfig` model) + admin CRUD in `src/routes/adminJsonConfigs.routes.js`.
- Existing “rate limiting” exists only as a **small in-memory Map** in `src/routes/log.routes.js` for frontend error logging.
  - This is not reusable, not configurable, and not metrics-friendly.

## Proposed architecture

### 1. Rate Limiter core module

Create a new internal module (example location):

- `src/services/rateLimiter/` (or `src/utils/rateLimiter/` if you prefer utility-style)

Core responsibilities:

- Maintain a registry of named limiters (e.g. `globalApiLimiter`).
- Provide:
  - Programmatic limiter interface.
  - Express middleware factory.
  - Metrics aggregation and query APIs.
  - Config resolution from storage (JSON config + overrides).

#### Programmatic API (proposed)

- `rateLimiter.define(name, config)`
  - Optional for code-first integration points. Adds an integration point to the registry.
- `rateLimiter.limit(name, opts?)`
  - Returns Express middleware: `app.use('/api', rateLimiter.limit('globalApiLimiter'))`.
- `rateLimiter.check(name, context)`
  - For non-Express contexts: returns `{ allowed, limit, remaining, retryAfterMs, reason }`.
- `rateLimiter.getConfig(name)`
  - Effective merged config (defaults + stored + runtime overrides).
- `rateLimiter.list()`
  - Registry + effective config summaries (for Admin UI table).

### 2. Configuration storage strategy

We want **runtime configurability** and stable storage with existing systems.

Recommended approach:

- **Primary config** in JSON Configs:
  - JsonConfig alias: `rate-limits` (or slug)
  - JSON schema:
    - `version`
    - `defaults`
    - `limiters` map keyed by limiter id

- **Quick override** (optional) in Global Settings:
  - `RATE_LIMITS_ENABLED` (boolean)
  - `RATE_LIMITS_FAIL_OPEN` (boolean)
  - Optionally: `RATE_LIMITS_JSON` (type `json`) for emergency override if JSON Config is broken

Why JSON Configs:

- Already has admin CRUD.
- Supports caching/TTL.
- Allows storing structured configs cleanly.

### 3. Integration points / registry

A limiter appears in the Admin UI when it’s an integration point in code.

Mechanism:

- Code registers limiters during app startup:
  - `rateLimiter.define('globalApiLimiter', { ...defaults... , integration: { routes: ['/api/*'] } })`
- Admin UI reads from a “registry list endpoint”:
  - returns known limiter ids even if not customized in stored config.

This gives you the desired behavior:

- Admin UI rate limits table will show a record for `globalApiLimiter` once the code registers it.

## Admin UI plan (module in admin dashboard)

### Navigation integration

- Add new item in `views/partials/dashboard/nav-items.ejs`:
  - `id: 'rate-limiter'`
  - `label: 'Rate Limiter'`
  - `path: adminPath + '/rate-limiter'`
  - `icon: 'ti-traffic-cone'` (or another tabler icon)

### Admin page

- Add a new admin page (EJS) rendered under `${adminPath}/rate-limiter`.
- Page layout:
  - Header: “Rate Limiter” + global enable/disable toggle + save status.
  - Body with either:
    - **Tabs**: `Rate limits` | `Metrics` | `Usage`
    - Or: top tabs for `Rate limits` + `Metrics`, and a collapsible “Usage docs” section.

### Rate limits table

Columns (minimum):

- `Limiter id` (e.g. `globalApiLimiter`)
- `Status` (enabled/disabled + effective mode)
- `Algorithm`
- `Window` / `Burst`
- `Identity` (per IP/user/org/etc.)
- `Limit`
- `Actions` (edit, reset to defaults)

Editing UX:

- Row “Edit” opens a modal/drawer.
- Form edits config and saves to JSON Config (`rate-limits`) via admin API.

### Metrics (sub-tab)

Focus:

- Provide “health” and “traffic shaping impact” views.

Recommended metric cards:

- Requests checked (total)
- Requests allowed
- Requests blocked
- Block rate (%)
- Top limiters by blocks
- Top identities by blocks (optional)

Time range:

- Default last 24h
- Select: 15m, 1h, 24h, 7d

### Usage documentation (sub-tab or collapsible)

Include:

- Express usage:
  - `app.use('/api', rateLimiter.limit('globalApiLimiter'))`
- Notes on identity keying (IP vs user vs org)
- How to define custom integration points
- How to test locally

## Metrics APIs (server)

### Endpoints (admin protected)

- `GET /api/admin/rate-limits`
  - returns registry + effective configs + where each limiter is used (integration info).
- `PUT /api/admin/rate-limits/:id`
  - updates stored config for one limiter.
- `POST /api/admin/rate-limits/:id/reset`
  - deletes override for limiter (revert to defaults).
- `GET /api/admin/rate-limits/metrics?range=...`
  - returns aggregated counts for dashboards.

Implementation note (plan-only):

- Reuse `basicAuth` like other admin APIs.

### Metrics storage

Options (choose one at implementation time):

- **In-memory rolling window** (fast, simplest, but resets on restart)
- **DB-backed aggregate** (more durable; could piggyback on ActionEvent model or a new collection)

Given this repo already tracks events in `ActionEvent` (metrics controller), an aligned approach:

- Create a new model (or reuse ActionEvent with `action: 'rate_limit'`) to store coarse events.
- Or keep a small in-memory aggregator and only store periodic snapshots.

## Configuration matrix (all possible configurations per limiter entry)

A limiter entry (`limiters[limiterId]`) should support these groups.

### Identity & keying

- `identity.type`:
  - `ip`
  - `userId`
  - `orgId`
  - `apiKey`
  - `header` (e.g. `x-tenant-id`)
  - `composite` (multiple fields)
- `identity.headerName` (for `header`)
- `identity.includePath` (boolean)
  - If true, key is scoped per route/path
- `identity.pathStrategy`:
  - `raw` | `normalized` | `template`

### Matching / scope

- `scope.routes`:
  - array of route patterns (e.g. `/api/*`, `/api/auth/login`)
- `scope.methods`:
  - array: `GET`, `POST`, etc.
- `scope.excludeRoutes`
- `scope.excludeIps`
- `scope.includeIps`

### Limiting algorithm

- `algorithm`:
  - `fixedWindow`
  - `slidingWindow`
  - `tokenBucket`
  - `leakyBucket`

### Limits / window

- `limit.max` (integer)
- `limit.windowMs` (integer)
- `limit.burst` (integer, optional)
- `limit.tokensPerInterval` (token bucket)
- `limit.intervalMs` (token bucket)

### Behavior on exceed

- `onLimit.statusCode` (default 429)
- `onLimit.body` (static JSON or template)
- `onLimit.headers`:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `Retry-After`
  - `X-RateLimit-Reset`
- `onLimit.includeDetails` (boolean; careful in prod)

### Storage / backend

- `store.type`:
  - `memory`
  - `mongo`
  - `redis` (future)
- `store.ttlMs` (how long counters live)
- `store.collectionName` (mongo)

### Consistency & safety

- `enabled` (boolean)
- `mode`:
  - `enforce`
  - `reportOnly`
  - `disabled`
- `failOpen` (boolean)
  - If store fails, allow request
- `timeoutMs` (store operation timeout)

### Observability

- `metrics.enabled` (boolean)
- `metrics.sampleRate` (0..1)
- `metrics.includeIdentityHash` (boolean)
- `metrics.tagKeys` (array): e.g. `['limiterId','method']`

### Overrides / dynamic tuning

- `overrides` (optional)
  - Conditional overrides by:
    - route
    - method
    - actor type (anon/auth)
    - role

### Example limiter entry

- `globalApiLimiter`:
  - identity: `ip` (or `userId` when authed)
  - scope: `/api/*`
  - algorithm: `fixedWindow`
  - limit: `max: 1200`, `windowMs: 60000`

## Rollout plan (phased)

### Phase 1: Core + config + registry + basic metrics

- Implement core limiter with memory store.
- Implement registry listing endpoint.
- Implement admin config read/write via JSON Config `rate-limits`.

### Phase 2: Admin UI

- Add new Admin Dashboard nav item.
- Add `/admin/rate-limiter` page with:
  - Rate limits table
  - Edit modal
  - Usage docs

### Phase 3: Durable store + richer metrics

- Add mongo/redis store option.
- Add time-range metrics APIs.

## Open questions (need your decisions before implementation)

Decisions locked in:

1. Runtime config storage:
   - JSON Configs only (alias: `rate-limits`)

2. Store backend (v1):
   - Mongo

3. Identity strategy for `globalApiLimiter`:
   - userId when authed else IP
   - helper APIs must allow supplying orgId or other identification metadata when needed

4. Mode:
   - reportOnly supported and configurable

5. Admin UI editing:
   - Advanced form editor + Advanced JSON editor

6. Admin nav placement:
   - System & DevOps

Implementation notes (to be updated as implementation lands):

- The first admin access will ensure a JsonConfig exists with alias `rate-limits`.
- Effective config will be the merge of:
  - base defaults (disabled by default)
  - JSON Config defaults + per-limiter overrides
  - (Mount path is inferred from Express at runtime for UI metadata)

## Implementation details (landed)

### Core

- Service: `src/services/rateLimiter.service.js`
  - Express middleware: `limit(id, opts?)` (implicitly registers + bootstraps config)
  - Programmatic check: `check(id, { req, identity })`
  - Admin helpers:
    - `list()`
    - `getRateLimitsConfigData()` / `updateRawConfig()`
    - `setLimiterOverride()` / `resetLimiterOverride()`
    - `bulkSetEnabled()`
    - `queryMetrics()`

### Mongo models

- Counters: `src/models/RateLimitCounter.js`
  - Collection: `rate_limit_counters`
  - TTL index on `expiresAt`
- Metrics buckets: `src/models/RateLimitMetricBucket.js`
  - Collection: `rate_limit_metric_buckets`
  - TTL index on `expiresAt`

### Admin APIs

- Routes: `src/routes/adminRateLimits.routes.js`
- Controller: `src/controllers/adminRateLimits.controller.js`

Endpoints:

- `GET /api/admin/rate-limits`
- `GET /api/admin/rate-limits/config`
- `PUT /api/admin/rate-limits/config`
- `GET /api/admin/rate-limits/metrics`
- `POST /api/admin/rate-limits/bulk-enabled`
- `PUT /api/admin/rate-limits/:id`
- `POST /api/admin/rate-limits/:id/reset`

### Admin UI

- Page: `views/admin-rate-limiter.ejs`
- Mounted at: `${adminPath}/rate-limiter` in `src/middleware.js`
- Dashboard nav item:
  - `views/partials/dashboard/nav-items.ejs` under `System & DevOps`

### Built-in integration point

- `globalApiLimiter`:
  - Mounted at `router.use('/api', rateLimiter.limit('globalApiLimiter'))`
  - Bootstrapped into JSON Configs on startup as `enabled: false` (one-time)

### Endpoint registry

- `src/admin/endpointRegistry.js` includes Rate Limiter endpoints for the API test page.

## Behavior (landed): implicit limiter registration + bootstrap

- `define()` is not required and is not part of the public API.
- Mounting `limit(id)`:
  - Registers the limiter in-memory for admin UI metadata (label defaults to id; mountPath inferred from Express).
  - Ensures a `rate-limits.limiters[id]` entry exists in JsonConfigs, defaulting to `{ enabled: false }`.
- Admin UI config takes precedence over any runtime metadata.

## Notes

- Any previous references to `define()` are deprecated by this implementation.

