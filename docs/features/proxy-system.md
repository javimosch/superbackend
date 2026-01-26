# Proxy system

## Overview

The Proxy system provides a public proxy endpoint mounted at `POST|GET|PUT|PATCH|DELETE|OPTIONS|HEAD /proxy/*`.

- Requests are proxied upstream to the target URL encoded in the path.
- The system is **deny-by-default**: a request is blocked unless there is a matching, enabled `ProxyEntry` configured in the Admin UI.
- Unknown targets are recorded as **discoveries** in the Cache Layer with a TTL (ephemeral, not stored as `ProxyEntry`).

## Public route behavior

### Target URL

- The request path after `/proxy/` is treated as the target URL.
- Supported schemes: `http` and `https`.

### Methods and bodies

- All methods are accepted.
- The proxy route is mounted with a raw body parser so it can forward arbitrary request bodies.

### Header proxying

- Incoming headers are proxied to the upstream request.
- Hop-by-hop headers are stripped.
- `Authorization` and `Cookie` are forwarded by default, but can be disabled per `ProxyEntry`.
- Optional per-entry allow/deny lists can further restrict forwarded headers.

## ProxyEntry model

`ProxyEntry` is stored in MongoDB collection `proxy_entries`.

Key fields:

- `enabled`: when false, matching requests are blocked.
- `match`: defines how a request is associated with an entry.
  - `type`: `exact|contains|regexp`
  - `applyTo`: `host|path|targetUrl`
  - `value`: match value
- `policy`: allow/deny rules.
  - `mode`: `whitelist|blacklist|allowAll|denyAll`
  - `rules`: `contains|regexp` rules applied to `targetUrl|host|path`
- `rateLimit`: optional linkage to Rate Limiter via `limiterId`.
- `cache`: optional caching configuration via Cache Layer.
  - `enabled`, `ttlSeconds`, `namespace`
  - `methods`: which methods are eligible for caching (defaults to `GET,HEAD`)
  - `keyParts`: configurable cache key components
- `headers`: header forwarding controls (`forwardAuthorization`, `forwardCookie`, allow/deny lists)
- `transform`: optional response transformation.

## Policy evaluation

- `whitelist` (default): deny unless any rule matches.
- `blacklist`: allow unless any rule matches.
- `allowAll`: always allow.
- `denyAll`: always deny.

If there is no matching enabled entry, the request is denied.

## Caching

When enabled and the HTTP method is included in `cache.methods`:

- Cache key is computed from configurable parts with safe defaults:
  - URL (+ query)
  - body hash
  - selected headers hash
- Cached value stores upstream response: `status`, `headers`, and `bodyBase64`.
- Only successful `2xx` responses are stored.

## Transformations

When enabled, a `ProxyEntry` can run a JS transform with a strict timeout.

- Implemented with `vm2`.
- The transform code must define `function transform(ctx)`.
- The transform can override:
  - `status`
  - `headers`
  - `bodyBase64` / `bodyText` / `json`

## Audit

The Proxy system logs to the existing Audit system.

- Actions are prefixed with `proxy.`.
- Response audit includes:
  - upstream status
  - `normalizedBody` for JSON responses (recursive traversal; nested arrays retain 1 sample item with `__arrayLength`).

## Admin UI

- Admin page: `${adminPath}/proxy` (`views/admin-proxy.ejs`)
- Admin API:
  - `GET /api/admin/proxy/entries` (includes configured entries + discoveries)
  - `GET /api/admin/proxy/entries/:id`
  - `POST /api/admin/proxy/entries`
  - `PUT /api/admin/proxy/entries/:id`
  - `DELETE /api/admin/proxy/entries/:id`

The Admin UI provides:

- Entry list + editor
- Discoveries list with a helper to prefill new entries
- Audit tab (filtered view of global audit logs)
