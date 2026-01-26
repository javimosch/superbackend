---
description: Proxy system (design + plan)
---

# Proxy system (SuperBackend) — Plan/Design

## Goals

- Expose a public route `/_proxy/*` or `/proxy/*` that:
  - Accepts **any HTTP method**.
  - Proxies request to a target URL derived from the path.
  - Proxies request headers (with security filters).
  - Captures each request as a **Proxy Request** entry and makes it visible/configurable in a dedicated **Admin UI: Proxy system**.
- Admin can configure per-proxy-entry:
  - **Allow/deny rules** using blacklist/whitelist with `contains` and/or `regexp` match.
  - **Rate limiting** using existing `rateLimiter.service`.
  - **Transformations** (request/response) via configurable transformation function.
  - **Cache layer** using existing `cacheLayer.service`.
- Admin UI has sub-tab **Audit** (uses existing `AuditEvent` system) and stores proxy response status + normalized response body.

## Non-goals (initial version)

- Full API gateway features (auth injection, retries, circuit breaker, mTLS).
- Multi-tenant proxy config per organization (unless required).

## Existing building blocks (found in codebase)

- **Rate Limiter**: `src/services/rateLimiter.service.js`
  - Provides Express middleware `rateLimiter.limit(limiterId, opts)`.
  - Stores config in `JsonConfig` under key `rate-limits`.
  - Supports `enabled`, `mode` (enforce/reportOnly), and identity strategies.
- **Cache Layer**: `src/services/cacheLayer.service.js`
  - `get(key,{namespace})`, `set(key,value,{namespace,ttlSeconds})` and admin UI exists.
  - Backend can be memory or redis; spills to Mongo for memory backend threshold.
- **Audit**: `src/services/auditLogger.js` + `src/routes/adminAudit.routes.js`
  - `logAuditSync({ req, action, outcome, entityType, entityId, details/meta })`
  - Sensitive scrubbing is automatic; depth-limited; arrays truncated.
- **Admin pages** rendered in `src/middleware.js` (EJS pages) and nav in `views/partials/dashboard/nav-items.ejs`.

## Route design

### Public proxy route

- Route: `POST|GET|PUT|PATCH|DELETE|OPTIONS|HEAD /proxy/*`
- Target URL derivation:
  - `req.originalUrl` after `/proxy/` is treated as the encoded target URL.
  - Example:
    - `/proxy/https://api1.com/users.json?x=1` -> target `https://api1.com/users.json?x=1`

 ## Locked-in decisions (2026-01-25)

 - Default behavior is **deny** unless a matching `ProxyEntry` exists and is **enabled**.
 - Unknown targets are still **auto-discovered** (upsert) but stored **ephemerally with TTL** using the existing Cache Layer (not persisted in Mongo as `ProxyEntry`).
 - Request header proxying includes `Authorization` and `Cookie` by default, but is configurable per `ProxyEntry`.
 - Caching is enabled for `GET`/`HEAD` by default; caching other methods must be enabled by admin.
 - Cache key parts are configurable; safe defaults include URL (with querystring), body hash, and selected headers hash.
 - Transform functions run as JS in a sandbox-ish environment with a hard timeout.

### Admin API routes

 - `GET /api/admin/proxy/entries` — list configured/discovered entries
- `GET /api/admin/proxy/entries/:id` — read entry
- `PUT /api/admin/proxy/entries/:id` — update entry (enable/disable, rules, cache, transform, rate limit linkage)
- `POST /api/admin/proxy/entries/:id/reset-metrics` (optional)
- `GET /api/admin/proxy/audit` — list proxy audit events (filter on `targetType = ProxyRequest` or `action startsWith proxy.`)

### Admin UI page

- Page: `${adminPath}/proxy` (like rate limiter and cache pages).
- UI sections:
  - **Entries**: discovered/configured proxy targets and rules
  - **Audit** sub-tab: audit view filtered to proxy actions

 ## Data model

 ### ProxyEntry

Represents an admin-configurable “proxy target pattern” + policies.

Suggested Mongo model (new): `ProxyEntry`

- `name`: string (admin label)
- `enabled`: boolean
- `match`:
  - `type`: `exact` | `contains` | `regexp`
  - `value`: string
  - `applyTo`: `targetUrl` | `host` | `path` (default: `targetUrl`)
- `policy`:
  - `mode`: `blacklist` | `whitelist` | `allowAll` | `denyAll`
  - `rules`: array of `{ type: contains|regexp, value: string, applyTo: targetUrl|host|path, enabled: boolean }`
- `rateLimit`:
  - `limiterId`: string (e.g. `proxy:<entryId>`)
  - `identity`: (optional) select from existing rate limiter identity options
- `cache`:
  - `enabled`: boolean
  - `ttlSeconds`: number
  - `namespace`: string (default `proxy`)
  - `keyTemplate`: string (optional; default computed from method+url(+query)+body hash+headers hash)
  - `methods`: array (optional; default `['GET','HEAD']`)
- `headers`:
  - `forwardAuthorization`: boolean (default true)
  - `forwardCookie`: boolean (default true)
  - `allowList`: array of header names (optional)
  - `denyList`: array of header names (optional)
- `transform`:
  - `enabled`: boolean
  - `type`: `js` (initial)
  - `code`: string (JS function body)
  - `timeoutMs`: number
- `stats`:
  - counters: `requests`, `blocked`, `cacheHits`, `cacheMisses`
- `createdAt`, `updatedAt`

### ProxyRequest (optional separate model)

Because you asked to store response status and normalized body: this can be done purely via Audit events (recommended for v1), or with a dedicated model.

Recommendation: **use AuditEvent** as the authoritative audit storage in v1.

- `action`: `proxy.request` (or `proxy.response`)
- `targetType`: `ProxyRequest`
- `targetId`: a deterministic id (e.g. hash of targetUrl + timestamp) or requestId
- `details/meta`:
  - request: method, targetUrl, headers (scrubbed), body summary
  - response: status, headers (scrubbed), normalizedBody

## Rule evaluation semantics

We need two layers:

1) **Entry selection**: choose which `ProxyEntry` applies to a request.
2) **Allow/Deny**: apply blacklist/whitelist rules inside that entry.

### 1) Entry selection

- Evaluate enabled entries, in order of **most specific first**:
  - exact > contains > regexp
  - longer `value` wins for exact/contains
- If none matches:
  - create a new discovered entry in DB (disabled by default) OR create in-memory “discovered list”.

Decision needed (see Open Questions): auto-create DB rows on any internet hit may be noisy.

### 2) Allow/Deny

Per your examples:

- If blacklist mode:
  - default allow
  - if any rule matches => deny
- If whitelist mode:
  - default deny
  - if any rule matches => allow

Rule match fields:

- `contains`: case-insensitive substring match
- `regexp`: compile with JS `RegExp` (flags configurable? default `i`)

## Proxy execution pipeline

1. Parse and validate target URL
   - Must be `http` or `https`
   - Must be absolute URL
2. Find matching `ProxyEntry`
   - If none, upsert into **ephemeral discovery list** via Cache Layer.
3. Apply allow/deny
   - If no matching enabled entry => return `403` with `{ error: 'Proxy request blocked' }`
   - Log audit `proxy.blocked`.
4. Apply rate limiting
   - Use `rateLimiter.limit(limiterId)` with inferred limiter id `proxy:<entryId>` or `proxy:<host>`.
5. Check cache (optional)
   - Default only when method is `GET`/`HEAD` unless admin enables others.
   - Compute cache key using configured parts; safe defaults include URL (+query), body hash and headers hash.
   - `cacheLayer.get(key,{namespace})`
   - If hit => return cached response and audit `proxy.cache.hit`
6. Dispatch upstream request
   - Use a robust HTTP client already used in codebase (need to confirm; likely `fetch` / `axios` / `undici`).
   - Proxy request headers with filtering:
     - Strip hop-by-hop headers: `connection`, `keep-alive`, `transfer-encoding`, `te`, `trailer`, `proxy-authorization`, `proxy-authenticate`, `upgrade`.
     - Remove or override `host`.
7. Transform response (optional)
   - `transformResponse({ status, headers, body, json }) -> { status?, headers?, body? }`
   - Enforce timeout.
8. Store in cache (optional)
   - Only cache if response status is 2xx (configurable later).
9. Return response
   - Preserve status, headers (filtered), and body.
10. Audit
   - Log `proxy.response` with status and normalized response body.

## Response body normalization for audit

You asked:

- “normalized, transverse object/array and keep 1 item on nested arrays”

Proposed normalization algorithm (v1):

- If JSON object:
  - recursively traverse up to depth N (e.g. 6)
  - for arrays:
    - keep only first element
    - also record `__arrayLength` at that node
- If non-JSON:
  - store string snippet up to max bytes (e.g. 4KB)

Note: the audit logger already scrubs and truncates arrays to 10 items; we still want the “keep 1 item on nested arrays” specifically for proxy auditing.

## Admin UI design (EJS)

Location patterns:

- Nav items: `views/partials/dashboard/nav-items.ejs`
- Admin page is served in `src/middleware.js` with `router.get(`${adminPath}/...`, basicAuth, ...)`.

New page:

- `views/admin-proxy.ejs`
  - Tabs:
    - Entries
    - Audit
  - Entries view:
    - list of entries with match summary, enabled flag, mode, hit stats
    - edit panel (JSON editor or form) with:
      - enabled
      - match definition
      - mode (blacklist/whitelist/allowAll/denyAll)
      - rules list
      - rate limit: link to limiter id, quick enable/disable
      - cache: enabled + ttl
      - transform: textarea with JS code, timeout
  - Audit view:
    - reuse existing `/api/admin/audit` but filter client-side for `action startsWith proxy.` or `targetType=ProxyRequest`.

Admin endpoint registry:

- Add a new section entry similar to Rate Limiter so the Admin Terminals feature can call endpoints.

## Security / safety constraints

This feature is a classic SSRF vector. Recommended defaults:

- Deny access to:
  - private IP ranges (RFC1918), loopback, link-local, metadata endpoints.
  - `localhost` and `.local`.
- Optionally allowlist outbound hosts at global level.
- Enforce max response size (bytes) and max timeouts.
- Do not forward `cookie` / `authorization` headers by default, unless explicitly allowed.

## Open questions (need decisions)

1. **Auto-create behavior**: Should every unknown `/proxy/*` create a DB `ProxyEntry` (could explode), or should we only store “discovered targets” in memory / separate collection with TTL?
2. **Default policy** when no entry matches: allow and create? or deny until configured?
3. **Header proxying**: Should `Authorization` and `Cookie` be forwarded by default?
4. **Transform language**: JS sandboxing strategy? (plain `vm` vs restricted evaluator) and what inputs/outputs are allowed.
5. **Cache semantics**:
   - Cache only GET/HEAD or any method?
   - Cache key includes which headers?
6. **Audit payload sizes**: max body bytes to store; should we only store JSON-normalized body?
7. **Upstream HTTP client**: confirm preferred library in this repo.

## Proposed implementation milestones (for later)

- Milestone A: core proxy route + parsing + minimal allow/deny + audit
- Milestone B: admin UI + CRUD for entries
- Milestone C: integrate rate limiter per entry
- Milestone D: integrate cache layer
- Milestone E: add transform function with timeout
- Milestone F: audit view improvements and response normalization
