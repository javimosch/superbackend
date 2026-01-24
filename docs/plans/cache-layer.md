---
description: cache-layer
---

# Cache Layer (Plan)

## Goal
Provide a unified caching system that can be used:

- Programmatically inside the backend (service API)
- Via an Admin API + Admin UI

Under the hood:

- Default backend is **in-memory**, with **automatic offload to MongoDB** once a configured threshold is reached.
- Optionally, the cache backend can be upgraded to **Redis** via **env** and/or **Global Settings**.

## Non-goals (initial version)

- Distributed eviction coordination across multiple app instances (unless Redis is enabled).
- Advanced cache coherency (tag invalidation, dependency graphs) beyond key-based operations.

## Requirements

### Programmatic API
Expose a stable internal service (e.g., `src/services/cacheLayer.service.js`) with:

- `get(key, opts?)`
- `set(key, value, opts?)`
- `delete(key)`
- `has(key)`
- `clear(scope?)`
- `keys(prefix?, pagination?)`
- `stats()`

Options:

- `ttlSeconds` (optional)
- `namespace` (optional) to prevent collisions
- `allowStale` (future)

### Storage behavior

#### In-memory (primary)
- Fast reads/writes.
- Maintains configurable eviction policy: `fifo|lru|lfu`.
- Stores metadata: `createdAt`, `updatedAt`, `expiresAt`, `sizeBytes`, `hits`, `lastAccessAt`.

#### MongoDB offload (secondary)
- When in-memory usage exceeds a threshold, offload older/less-used entries to MongoDB.
- Mongo is used as a persistence and spillover layer, not as the fastest cache.

#### Redis (optional upgrade)
- When enabled, prefer Redis as the primary cache backend.
- When Redis is enabled, Mongo offload is disabled (Redis only mode).

## Configuration sources (priority)
1. **Env vars** (hard override)
2. **Global Settings** (runtime configurable from Admin UI)
3. Defaults

### Proposed env vars
- `CACHE_LAYER_BACKEND=memory|redis`
- `CACHE_LAYER_REDIS_URL=redis://...`
- `CACHE_LAYER_REDIS_PREFIX=superbackend:`
- `CACHE_LAYER_OFFLOAD_THRESHOLD_BYTES=...`
- `CACHE_LAYER_MAX_ENTRY_BYTES=...`
- `CACHE_LAYER_DEFAULT_TTL_SECONDS=...`
- `CACHE_LAYER_AT_REST_FORMAT=string|base64`

### Proposed Global Settings keys
- `CACHE_LAYER_BACKEND` (string: `memory`/`redis`)
- `CACHE_LAYER_REDIS_URL` (encrypted)
- `CACHE_LAYER_REDIS_PREFIX` (string)
- `CACHE_LAYER_EVICTION_POLICY` (string: `fifo|lru|lfu`)
- `CACHE_LAYER_OFFLOAD_THRESHOLD_BYTES` (number)
- `CACHE_LAYER_DEFAULT_TTL_SECONDS` (number)
- `CACHE_LAYER_MAX_ENTRY_BYTES` (number)
- `CACHE_LAYER_AT_REST_FORMAT` (string: `string|base64`)

Admin UI will manage these settings via existing Global Settings endpoints.

## Data model (MongoDB)
Create a new model (e.g. `CacheEntry`) for offloaded entries:

- `key` (string, indexed, unique per namespace)
- `namespace` (string, indexed)
- `value` (Mixed or string)
- `valueType` (string: `json|string|number|boolean|buffer_base64`)
- `sizeBytes` (number)
- `createdAt`, `updatedAt`
- `expiresAt` (date, TTL index)
- `hits` (number)
- `lastAccessAt` (date)
- `source` (string: `offloaded|manual`)

Indexes:
- `{ namespace: 1, key: 1 }` unique
- `{ expiresAt: 1 }` TTL
- `{ updatedAt: -1 }`

Implementation notes:

- Implemented as `src/models/CacheEntry.js` using collection `cache_entries`.
- TTL index is implemented on `expiresAt` with `expireAfterSeconds: 0`.
- Values are stored as a string in `value` with `atRestFormat: string|base64`.

## Service architecture

### Core interface
`CacheBackend` interface:

- `get(key)`
- `set(key, entry)`
- `delete(key)`
- `keys(prefix, page)`
- `clear()`
- `stats()`

### Implementations
- `MemoryBackend` (Map + metadata + eviction policy)
- `MongoBackend` (Mongoose model `CacheEntry`)
- `RedisBackend` (node-redis or ioredis; pick based on existing deps)

### CacheLayer orchestrator
`CacheLayerService`:

- Reads config (env/global settings) at startup, and optionally refreshes periodically.
- Routes operations to the selected primary backend.
- For memory backend:
  - Keeps entries in memory.
  - When threshold exceeded:
    - Offload selected entries to Mongo.
    - Remove them from memory.
  - On miss in memory:
    - Try Mongo.
    - If found and not expired:
      - Optionally rehydrate into memory.

### Serialization rules
- Values are stored as **string at rest** by default.
- On read, if the stored string is valid JSON, it is auto-decoded to JSON.
- Base64 at rest is supported:
  - Globally via `CACHE_LAYER_AT_REST_FORMAT` / `CACHE_LAYER_AT_REST_FORMAT` setting.
  - Per-key override in the Admin UI/API.

## Admin API (new)
Mount under:

- `/api/admin/cache`

Endpoints:

- `GET /api/admin/cache/config`
  - returns effective config (resolved env + global settings + defaults)

- `PUT /api/admin/cache/config`
  - updates global settings relevant to cache layer (redis url/prefix/backend, thresholds)

- `GET /api/admin/cache/keys?namespace=&prefix=&page=&pageSize=&backend=`
  - list keys with metadata

- `GET /api/admin/cache/entry?namespace=&key=&backend=`
  - get a key/value + metadata

- `PUT /api/admin/cache/entry`
  - body: `{ namespace, key, value, ttlSeconds }`

- `DELETE /api/admin/cache/entry?namespace=&key=&backend=`

- `POST /api/admin/cache/clear`
  - body: `{ backend: 'memory'|'mongo'|'redis'|'all', namespace?: string, prefix?: string }`

- `GET /api/admin/cache/metrics`
  - returns:
    - memory estimated bytes
    - mongo cache entries count + total size
    - redis memory usage (if enabled) + key count
    - hit/miss rates
    - offload events counters

All endpoints protected by admin basic auth.

Implementation notes:

- Implemented routes: `src/routes/adminCache.routes.js`.
- Implemented controller: `src/controllers/adminCache.controller.js`.
- Mounted at `/api/admin/cache` in `src/middleware.js`.
- Admin actions are audit-logged via `src/services/auditLogger.js`.

## Admin UI (new)
New admin page:

- `/admin/cache`

UI sections:

1. **Configuration**
   - Backend selector (memory/redis)
   - Eviction policy selector (fifo/lru/lfu) with an Info section describing when to use each
   - Redis URL (encrypted reveal pattern like other encrypted settings)
   - Redis key prefix
   - Offload threshold (bytes)
   - Default TTL (defaults to 10 minutes)
   - Allow no-expiry entries (supported)
   - Max entry size
   - At-rest format selector (string/base64)

2. **Operations**
   - Clear buttons:
     - Clear memory cache
     - Clear mongo cache
     - Clear redis cache
     - Clear all
   - Optional filters: namespace/prefix

3. **Explorer**
   - List keys with pagination and filters
   - View key details (value + metadata)
   - Edit value + TTL and save
   - Delete key

4. **Metrics**
   - Memory usage
   - Mongo size + entries
   - Redis size + keys
   - Hit/miss rates
   - Offload counts

Navigation:
- Add `Cache` item under an appropriate section (likely System & DevOps or Monitoring).

Implementation notes:

- Implemented view: `views/admin-cache.ejs`.
- Mounted at `/admin/cache` in `src/middleware.js`.
- Navigation item added in `views/partials/dashboard/nav-items.ejs`.

## Audit
Log admin actions using existing audit system:

- `cache.config.update`
- `cache.entry.set`
- `cache.entry.delete`
- `cache.clear`

Include:
- target backend
- namespace/key
- before/after (for entry edits)

## Security / Safety
- Admin-only.
- Redact or block keys matching sensitive patterns (e.g. `token`, `secret`, `password`) in UI and API responses.
- Enforce max entry size.

## Testing plan (implementation phase)
- Unit tests for memory eviction + offload behavior.
- Integration tests for Admin API endpoints.
- Redis optional tests (skipped if not configured).

## Open questions (need your input before implementation)
1. **Eviction policy** for memory backend: configurable (fifo/lru/lfu) with UI guidance.
2. **TTL semantics**: default 10 minutes; no-expiry allowed.
3. **Offload selection**: policy-aligned eviction selection (fifo/lru/lfu) used to pick spill candidates.
4. **Value types**: string at rest with JSON auto-decode; base64 at rest supported globally or per key.
5. **Redis + Mongo interplay**: Redis only when enabled.
6. **Namespaces**: optional; default namespace used when not provided.
7. **Metrics accuracy**: estimated is acceptable.
