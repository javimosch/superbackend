# Cache Layer

## What it is

The Cache Layer provides a unified caching API for:

- Programmatic use inside the backend.
- Admin management via an Admin API and Admin UI.

Backends:

- `memory` (primary in-memory cache with spillover to MongoDB).
- `redis` (Redis-only mode).

## Programmatic usage

The service is exposed as:

- `require('./src/services/cacheLayer.service')`
- `require('@intranefr/superbackend').services.cacheLayer`

Main operations:

- `await cacheLayer.get(key, { namespace, rehydrate })`
- `await cacheLayer.set(key, value, { namespace, ttlSeconds, allowNoExpiry, atRestFormat })`
- `await cacheLayer.delete(key, { namespace })`
- `await cacheLayer.clear({ backend, namespace, prefix })`
- `await cacheLayer.listKeys({ namespace, prefix })`
- `await cacheLayer.getEntry(key, { namespace })`
- `await cacheLayer.metrics()`

Namespaces are optional; when omitted the default namespace is `default`.

TTL:

- Default TTL is driven by configuration (`CACHE_LAYER_DEFAULT_TTL_SECONDS`, default `600`).
- Per-entry TTL may be provided via `ttlSeconds`.
- No-expiry is supported by using `ttlSeconds: null` (when `allowNoExpiry` is enabled).

## Data model

### CacheEntry

Mongo collection: `cache_entries`

Fields:

- `namespace` (string)
- `key` (string)
- `value` (string at rest)
- `atRestFormat` (`string|base64`)
- `sizeBytes`
- `expiresAt` (TTL index)
- `hits`
- `lastAccessAt`
- `source` (`offloaded|manual`)

Indexes:

- Unique index: `{ namespace: 1, key: 1 }`
- TTL index: `{ expiresAt: 1 }` with `expireAfterSeconds: 0`

## Serialization

Values are stored as **string at rest** by default.

- If the stored string parses as JSON, reads auto-decode to JSON.
- Base64 at rest can be enabled globally (`CACHE_LAYER_AT_REST_FORMAT=base64`) or per write (`atRestFormat: 'base64'`).

## Eviction policies

Configurable for the memory backend:

- `fifo`
- `lru`
- `lfu`

The eviction policy also defines which entries are chosen as spill candidates when the memory threshold is exceeded.

## Configuration

Configuration is resolved in this priority order:

1. Environment variables
2. Global Settings
3. Defaults

Env vars:

- `CACHE_LAYER_BACKEND=memory|redis`
- `CACHE_LAYER_REDIS_URL=redis://...`
- `CACHE_LAYER_REDIS_PREFIX=superbackend:`
- `CACHE_LAYER_EVICTION_POLICY=fifo|lru|lfu`
- `CACHE_LAYER_OFFLOAD_THRESHOLD_BYTES=...`
- `CACHE_LAYER_MAX_ENTRY_BYTES=...`
- `CACHE_LAYER_DEFAULT_TTL_SECONDS=...`
- `CACHE_LAYER_AT_REST_FORMAT=string|base64`

Global Settings keys:

- `CACHE_LAYER_BACKEND`
- `CACHE_LAYER_REDIS_URL` (encrypted)
- `CACHE_LAYER_REDIS_PREFIX`
- `CACHE_LAYER_EVICTION_POLICY`
- `CACHE_LAYER_OFFLOAD_THRESHOLD_BYTES`
- `CACHE_LAYER_MAX_ENTRY_BYTES`
- `CACHE_LAYER_DEFAULT_TTL_SECONDS`
- `CACHE_LAYER_AT_REST_FORMAT`

## Admin UI

- URL: `/admin/cache`
- Access: protected by admin basic auth.

Capabilities:

- Configure backend (memory/redis)
- Configure eviction policy
- Configure TTL defaults, max entry size, at-rest format
- Configure Redis URL/prefix (stored via Global Settings)
- Configure Mongo offload threshold (memory backend)
- Clear cache (memory/mongo/redis/all)
- Explore key/value entries
- Manually update cache keys
- View usage metrics

## Admin API

All endpoints below are protected by basic auth.

- `GET /api/admin/cache/config`
- `PUT /api/admin/cache/config`
- `GET /api/admin/cache/keys?namespace=&prefix=`
- `GET /api/admin/cache/entry?namespace=&key=`
- `PUT /api/admin/cache/entry`
- `DELETE /api/admin/cache/entry?namespace=&key=`
- `POST /api/admin/cache/clear`
- `GET /api/admin/cache/metrics`

## Audit

Admin actions are recorded via the built-in audit system:

- `cache.config.update`
- `cache.entry.set`
- `cache.entry.delete`
- `cache.clear`
