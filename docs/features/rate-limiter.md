# Rate limiter

## Overview

The rate limiter provides configurable request limiting for Superbackend.

- Configuration is stored in the JsonConfigs system.
- Limiters are discovered implicitly when mounted/used.
- Middleware and programmatic helpers are available.

## Configuration

Configuration is stored in a JsonConfig document with:

- `slug`: `rate-limits`
- `alias`: `rate-limits`

The JSON payload shape:

- `version` (number)
- `defaults` (object)
- `limiters` (object keyed by limiter id)

### Supported limiter fields

- `enabled` (boolean)
- `mode` (`reportOnly` | `enforce` | `disabled`)
- `algorithm` (`fixedWindow`)
- `limit.max` (number)
- `limit.windowMs` (number)
- `identity.type` (`userIdOrIp` | `userId` | `ip` | `orgId` | `header`)
- `identity.headerName` (string, when `identity.type=header`)
- `metrics.enabled` (boolean)
- `metrics.bucketMs` (number)
- `metrics.retentionDays` (number)
- `store.ttlBufferMs` (number)
- `store.failOpen` (boolean)

## Identity behavior

Default identity resolution:

- If a Bearer JWT is present and decodes to a `userId`, the limiter identity uses `userId`.
- Otherwise the limiter identity uses the request IP.

When using helpers programmatically, a caller can supply additional identity metadata (e.g. orgId or a custom identity key).

## Storage

### Counters

Rate limiting counters are stored in MongoDB collection:

- `rate_limit_counters`

Each counter is scoped by:

- `limiterId`
- `identityKey`
- `windowStart`

Counters use TTL via `expiresAt`.

### Metrics

Metrics are stored in MongoDB collection:

- `rate_limit_metric_buckets`

Buckets are keyed by:

- `limiterId`
- `bucketStart`

Buckets use TTL via `expiresAt`.

## Admin UI

An admin page is available at:

- `/admin/rate-limiter`

It provides:

- A list of discovered rate limiters
- A form editor for limiter overrides
- A raw JSON editor for the full `rate-limits` config
- A metrics view powered by admin APIs

## APIs

Admin APIs are available under:

- `/api/admin/rate-limits`

Key endpoints:

- `GET /api/admin/rate-limits` (list registry + effective config)
- `GET /api/admin/rate-limits/config` (get raw config)
- `PUT /api/admin/rate-limits/config` (save raw config)
- `PUT /api/admin/rate-limits/:id` (save per-limiter override)
- `POST /api/admin/rate-limits/:id/reset` (reset per-limiter override)
- `GET /api/admin/rate-limits/metrics` (aggregated counts)
- `POST /api/admin/rate-limits/bulk-enabled` (bulk enable/disable)

## Programmatic usage

### Express middleware

Use the helper middleware:

- `helpers.rateLimiter.limit('globalApiLimiter')`

Mounting a limiter via `limit(id)` will auto-bootstrap a disabled per-limiter entry in the `rate-limits` JsonConfig (one-time, if it does not already exist).

By default, limiters are **disabled** until an admin enables them.

### Manual checks

Use:

- `helpers.rateLimiter.check('globalApiLimiter', { req, identity })`

The `identity` object can include `userId`, `ip`, `orgId`, or `identityKey`.

## Registry / discovery

Limiters are discovered implicitly. There is no required code-side registration step.

The admin list includes:

- Limiters that have been mounted/used at runtime
- Limiters present in the `rate-limits` JsonConfig `limiters` map
