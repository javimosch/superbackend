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

---

## Goals
- Admin UI to:
  - Manage multiple DB connections (create/test/edit/disable).
  - Browse schemas/collections/tables.
  - View records with pagination, filtering, sorting.
  - Edit records safely (insert/update/delete) with guardrails.
- Support remote targets:
  - MongoDB (full URI)
  - MySQL (full URI)

## Non-goals (initial)
- Arbitrary SQL shell / arbitrary Mongo commands.
- SSH tunneling, client cert uploads, IAM auth flows.
- Complex joins / query planner UI.
- Multi-tenant “per customer” access (admin-only feature).

---

## UX / Admin flows
1. **Connections screen** (admin-only)
   - List connection profiles (name, type, masked URI, status, readOnly).
   - Actions: Test, Enable/Disable, Delete.
   - “Edit secrets” handled separately to avoid accidental exposure.

2. **Browser screen**
   - Left: connection selector + tree
     - Mongo: connection → databases → collections
     - MySQL: connection → databases → tables
   - Main: table view (rows), with:
     - pagination controls
     - filter builder (simple)
     - JSON view for a row/document
   - Edit modal:
     - Mongo: JSON editor + “Update ($set)” mode
     - MySQL: per-column editor + JSON editor fallback

3. **Safety defaults**
   - Per-connection flag `readOnly: true` by default.
   - “Enable writes” requires explicit toggle + confirm.

---

## Data model (stored in primary Mongo)
Create a new Mongo model (e.g. `ExternalDbConnection`):
- `name` (unique)
- `type`: `mongo | mysql`
- `status`: `enabled | disabled`
- `readOnly`: boolean
- `config` (non-secret):
  - Common: { `uriMasked`, optional `defaultDatabase` }
- `secrets` (encrypted at rest):
  - Common: { `uri` }
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
- `insertRecord({ database, namespace, payload })`
- `updateRecord({ database, namespace, id, patch })`
- `deleteRecord({ database, namespace, id })`

Implementation notes:
- Mongo adapter:
  - Use `mongoose.createConnection(uri)` (or native `mongodb` driver) and operate on `connection.db` for dynamic collections.
  - List DBs via `admin` command (e.g., `listDatabases`) and switch db context per request.
  - Filters accept limited JSON; validate and restrict operators to `$and/$or`, `$eq`, `$in`, `$regex` (optional) to reduce risk.
- MySQL adapter:
  - Use a pool (e.g. `mysql2/promise`) and parameterized queries.
  - List DBs via `SHOW DATABASES` (subject to user privileges); list tables via `SHOW TABLES FROM <db>`.
  - No raw SQL input; build queries from introspected columns.
  - Updates/deletes require primary key; block mass updates.

### 3) Routes/controllers
Add admin-only APIs under `/api/admin/db-browser/*` (basic auth):
- Connections:
  - `GET /connections`
  - `POST /connections` (create)
  - `PUT /connections/:id` (update non-secret fields)
  - `POST /connections/:id/secrets` (set/rotate secrets)
  - `POST /connections/:id/test`
  - `DELETE /connections/:id`
- Browsing:
  - `GET /:connectionId/databases`
  - `GET /:connectionId/databases/:database/namespaces`
  - `GET /:connectionId/databases/:database/namespaces/:namespace/schema`
  - `GET /:connectionId/databases/:database/namespaces/:namespace/records`
  - `GET /:connectionId/databases/:database/namespaces/:namespace/records/:id`
- Writing (blocked if `readOnly`):
  - `POST /:connectionId/databases/:database/namespaces/:namespace/records`
  - `PUT /:connectionId/databases/:database/namespaces/:namespace/records/:id`
  - `DELETE /:connectionId/databases/:database/namespaces/:namespace/records/:id`

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

---

## Validation & testing plan
- Unit tests:
  - Adapter query builders (MySQL) and filter validation (Mongo).
  - Permission enforcement: `readOnly` blocks writes.
  - Secret storage: encrypted at rest, never echoed back.
- Integration tests (mocked DBs):
  - Start ephemeral Mongo/MySQL (CI optional) OR mock drivers and assert calls.

---

## Rollout plan
1. Ship read-only browsing for Mongo + MySQL.
2. Add guarded write operations (per-connection `readOnly=false` + confirm).
3. Add nicer filters/search if needed.

---

## Open questions (need answers to lock the plan)
1. Write scope: in v1 do you want **update only**, or also **insert** and **delete**?
2. Safety/guardrails: do you want per-connection **allow/deny lists** (databases/tables/collections) to prevent browsing sensitive areas by mistake?
3. Filtering v1: confirm “simple” means:
   - MySQL: exact-match filters on selected columns (no LIKE/regex), plus sort + pagination
   - Mongo: `_id` lookup + limited exact-match filters (no arbitrary operators)

