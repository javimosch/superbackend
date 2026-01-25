## Database Browser (MySQL + Mongo) — Multi-Remote DB Support (Plan)

### Context
SuperBackend currently connects to a single “primary” MongoDB via `MONGODB_URI` (see `src/middleware.js`). Admin UI is served under `/admin/*` (basic auth), with JSON/admin APIs under `/api/admin/*`.

This plan adds an **Admin Database Browser** to view + edit records across **multiple remote databases** (MongoDB and MySQL), from within the SuperBackend admin panel.

### Confirmed constraints (from user)
- Auth: **basic-auth only**, accessible via the Admin Dashboard UI (`views/admin-dashboard.ejs`).
- MySQL scope (v1): **browse all available databases**, then **tables per database** (keep it simple).
- Export: **not needed** in v1.
- Credentials UX: **full URIs** (Mongo + MySQL).
- TLS: **standard** (via URI options / driver defaults; no custom CA/cert management in v1).
- Remote DB access: **read-only in v1** (no inserts/updates/deletes against remote DBs).
- Guardrails: **none in v1** (no allow/deny lists; basic-auth is the gate).
- Filtering: include **contains/LIKE** for MySQL and **regex/contains-style** for Mongo.

---

## Goals
- Admin UI to:
  - Manage multiple DB connections (create/test/edit/disable).
  - Browse schemas/collections/tables.
  - View records with pagination, filtering, sorting.
- v1 focuses on **safe read-only browsing** of remote DBs (writes can be a later phase).
- Support remote targets:
  - MongoDB (full URI)
  - MySQL (full URI)

## Non-goals (initial)
- Arbitrary SQL shell / arbitrary Mongo commands.
- SSH tunneling, client cert uploads, IAM auth flows.
- Complex joins / query planner UI.
- Multi-tenant “per customer” access (admin-only feature).
- Remote writes (insert/update/delete) in v1.

---

## UX / Admin flows
1. **Connections screen** (admin-only)
   - List connection profiles (name, type, masked URI, enabled).
   - Actions: Test, Enable/Disable, Edit, Delete.
   - Secrets are never returned; UI can optionally rotate URI by providing a new one.

2. **Browser screen**
   - Left: connection selector + tree
     - Mongo: connection → databases → collections
     - MySQL: connection → databases → tables
   - Main: table view (rows), with:
     - pagination controls
     - filter builder (simple)
       - MySQL: per-column “contains” → `LIKE '%value%'`
       - Mongo: per-field “contains” → `{ field: { $regex: value, $options: 'i' } }`
     - JSON view for a row/document

   Notes:
   - v1 is **read-only** for remote DBs, so no “edit record” UI.

3. **Safety defaults**
   - v1 is strictly **read-only** at the API/adapter level.
   - Only safe query parameters are accepted; no raw SQL / raw Mongo commands.

---

## Data model (stored in primary Mongo)
Create a new Mongo model (e.g. `ExternalDbConnection`):
- `name` (unique)
- `type`: `mongo | mysql`
- `enabled`: boolean
- `uriMasked` (non-secret)
- `uriEncrypted` (encrypted at rest)
- `createdAt`, `updatedAt`

Encryption approach:
- Reuse existing SuperBackend encryption patterns (same key as encrypted global settings: `SUPERBACKEND_ENCRYPTION_KEY`).
- Never return decrypted secrets from APIs.

---

## Backend architecture
### 1) Connection manager service
Add `externalDbConnections.service` responsible for:
- Loading enabled connection profiles from Mongo.
- Returning adapter instances by `connectionId`.
- Connection pooling + lifecycle:
  - LRU cache by `connectionId`
  - TTL + max open connections
  - timeouts and health checks

### 2) DB adapters
Define a common interface:
- `testConnection()`
- `listDatabases()`
- `listNamespaces({ database })` (Mongo: collections; MySQL: tables)
- `getSchema({ database, namespace })` (optional; for MySQL columns)
- `listRecords({ database, namespace, page, pageSize, filters, sort })`
- `getRecord({ database, namespace, id })`

Read-only v1: no insert/update/delete methods exposed.

Implementation notes:
- Mongo adapter:
  - Use `mongoose.createConnection(uri)` (or native `mongodb` driver) and operate on `connection.db` for dynamic collections.
  - List DBs via `admin` command (e.g., `listDatabases`) and switch db context per request.
  - Filters accept limited JSON; validate and restrict operators to `$and/$or`, `$eq`, `$in`, `$regex` (optional) to reduce risk.
- MySQL adapter:
  - Use a pool (e.g. `mysql2/promise`) and parameterized queries.
  - List DBs via `SHOW DATABASES` (subject to user privileges); list tables via `SHOW TABLES FROM <db>`.
  - No raw SQL input; build queries from introspected columns.
  - Filtering uses `LIKE` for “contains” style.

### 3) Routes/controllers
Add admin-only APIs under `/api/admin/db-browser/*` (basic auth):
- Connections:
  - `GET /connections`
  - `GET /connections/:id`
  - `POST /connections` (create)
  - `PATCH /connections/:id` (update name/type/enabled, optionally rotate URI)
  - `POST /connections/:id/test`
  - `DELETE /connections/:id`
- Browsing:
  - `GET /connections/:id/databases`
  - `GET /connections/:id/databases/:database/namespaces`
  - `GET /connections/:id/databases/:database/namespaces/:namespace/schema`
  - `GET /connections/:id/databases/:database/namespaces/:namespace/records`
  - `GET /connections/:id/databases/:database/namespaces/:namespace/records/:recordId`

Read-only v1: no remote write APIs.

### 4) Auditing & logging
- Wrap all admin DB-browser APIs with existing audit middleware.
- Scrub secrets from logs and audit payloads (mask URIs/passwords).

---

## Admin UI integration
- Add a new admin page route: `GET /admin/db-browser`.
- Add a navigation entry in `views/partials/dashboard/nav-items.ejs` (Admin Dashboard module list), e.g. `id: 'db-browser'`, `path: adminPath + '/db-browser'`.
- Frontend approach:
  - Server-rendered EJS page shell + JS that calls `/api/admin/db-browser/*`.
  - Reuse existing admin UI styles/components.

Implementation notes (actual):
- Page: `views/admin-db-browser.ejs`
- Route wiring: `src/middleware.js`

---

## Validation & testing plan
- Unit tests:
  - Adapter query builders (MySQL) and filter validation (Mongo).
  - Secret storage: encrypted at rest, never echoed back.
- Integration tests (mocked DBs):
  - Start ephemeral Mongo/MySQL (CI optional) OR mock drivers and assert calls.

---

## Rollout plan
1. Ship read-only browsing for Mongo + MySQL.
2. Add nicer filters/search if needed.
3. (Optional later) Add guarded write operations with explicit enable + audit.

---

## Plan lock-in
Locked for implementation:
- Basic-auth only, exposed as an Admin Dashboard module.
- Remote DB access is read-only (Mongo + MySQL).
- MySQL browsing: list databases → list tables per database.
- Filtering supports contains-style:
  - MySQL: `LIKE '%value%'`
  - Mongo: case-insensitive `$regex` for selected fields.

---

## Status
### Repo snapshot (as implemented)
_Verified against the codebase on 2026-01-24._

#### Implemented
- **Admin page**: `GET /admin/db-browser` (basic-auth). Wired in `src/middleware.js` and renders `views/admin-db-browser.ejs`.
- **Admin navigation**: `views/partials/dashboard/nav-items.ejs` includes `{ id: 'db-browser', path: adminPath + '/db-browser' }`.
- **Model**: `src/models/ExternalDbConnection.js` (stored in primary Mongo) with:
  - `name` (unique)
  - `type` (`mongo | mysql`)
  - `enabled`
  - `uriMasked` (safe to return)
  - `uriEncrypted` (AES-256-GCM payload; never returned)
- **Encryption**: `src/utils/encryption.js` (env key `SUPERBACKEND_ENCRYPTION_KEY`, with fallback `SAASBACKEND_ENCRYPTION_KEY`).
- **Backend service**: `src/services/dbBrowser.service.js`
  - Connection profile CRUD (create/update/delete/list/get)
  - Adapter cache keyed by connection id + `updatedAt` (no TTL/LRU yet)
  - Mongo adapter via `mongoose.createConnection()` with `listDatabases`, `listNamespaces` (collections), `listRecords`, `getRecord`
    - Filtering is **single-field contains** implemented as case-insensitive regex; `_id` special-cased.
    - No raw query input.
  - MySQL adapter via `mysql2/promise` with `listDatabases`, `listNamespaces` (tables), `getSchema` (`SHOW COLUMNS`), `listRecords`, `getRecord`
    - Filtering is **single-field contains** implemented as `LIKE ?` (parameterized).
    - Sort/filter fields are validated against introspected columns.
- **Admin APIs** (mounted at `/api/admin/db-browser`, all basic-auth via route middleware in `src/routes/adminDbBrowser.routes.js`):
  - `GET    /connections`
  - `GET    /connections/:id`
  - `POST   /connections` *(audited)*
  - `PATCH  /connections/:id` *(audited)*
  - `DELETE /connections/:id` *(audited)*
  - `POST   /connections/:id/test` *(audited)*
  - `GET    /connections/:id/databases`
  - `GET    /connections/:id/databases/:database/namespaces`
  - `GET    /connections/:id/databases/:database/namespaces/:namespace/schema`
  - `GET    /connections/:id/databases/:database/namespaces/:namespace/records`
  - `GET    /connections/:id/databases/:database/namespaces/:namespace/records/:recordId`

#### Known gaps / mismatches vs this plan (follow-ups)
- ✅ **MySQL dependency**: `mysql2` is installed in `package.json` dependencies (added 2026-01-24), enabling MySQL browsing at runtime.
- ✅ **Audit coverage**: All DB Browser endpoints are wrapped with audit middleware now, including *browsing* endpoints (databases/namespaces/schema/records/record).
- **Adapter lifecycle**: Cache is a simple `Map` keyed by connection id + updatedAt; there is no TTL/max-open/LRU eviction yet.
- **Filters**: The plan described a more general filter builder; current implementation supports a single `filterField + filterValue`.

#### Notes
- Current UI is a single EJS page shell + Vue 3 (via CDN) that calls the APIs above and provides: connection management, browse DBs/namespaces, pagination, filter/sort, and a JSON modal per row/document.

