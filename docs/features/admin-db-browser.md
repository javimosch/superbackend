# Admin DB Browser

## What it is

The **Admin DB Browser** is a basic-auth protected admin module that lets SuperBackend admins browse data across **multiple remote databases**:

- MongoDB (full URI)
- MySQL (full URI)

v1 is intentionally **read-only**: no inserts/updates/deletes are exposed to remote databases.

## Access

### Admin UI

- Route: `GET /admin/db-browser`
- Auth: HTTP Basic Auth (`ADMIN_USERNAME` / `ADMIN_PASSWORD`)

If you mount SuperBackend in middleware mode under a prefix (example `/saas`), the route becomes:

- `GET /saas/admin/db-browser`

### Admin APIs

All DB Browser APIs are under:

- Base: `/api/admin/db-browser/*`
- Auth: HTTP Basic Auth

With a mount prefix:

- `/saas/api/admin/db-browser/*`

## Stored data model

Remote DB connection profiles are stored in the **primary MongoDB** as `ExternalDbConnection`:

- `name` (unique)
- `type`: `mongo | mysql`
- `enabled`: boolean
- `uriMasked`: safe-to-return URI (no secrets)
- `uriEncrypted`: encrypted-at-rest URI payload (never returned)
- `createdAt`, `updatedAt`

### Encryption

Encryption reuses SuperBackend’s existing encryption helper:

- `SUPERBACKEND_ENCRYPTION_KEY` (primary)
- `SAASBACKEND_ENCRYPTION_KEY` (fallback)

The decrypted URI is only used server-side to establish remote DB connections.

## API

All routes below are basic-auth protected.

### Connections

- `GET    /api/admin/db-browser/connections`
- `GET    /api/admin/db-browser/connections/:id`
- `POST   /api/admin/db-browser/connections` (audited)
- `PATCH  /api/admin/db-browser/connections/:id` (audited)
- `DELETE /api/admin/db-browser/connections/:id` (audited)
- `POST   /api/admin/db-browser/connections/:id/test` (audited)

Notes:
- Secrets are never returned.
- Rotating a URI is done by PATCHing with a new URI.

### Browsing (read-only)

- `GET /api/admin/db-browser/connections/:id/databases` (audited)
- `GET /api/admin/db-browser/connections/:id/databases/:database/namespaces` (audited)
- `GET /api/admin/db-browser/connections/:id/databases/:database/namespaces/:namespace/schema` (audited)
- `GET /api/admin/db-browser/connections/:id/databases/:database/namespaces/:namespace/records` (audited)
- `GET /api/admin/db-browser/connections/:id/databases/:database/namespaces/:namespace/records/:recordId` (audited)

#### Query parameters (records)

Current implementation supports a single-field filter + optional sort:

- `page` (default: 1)
- `pageSize` (default: 50)
- `filterField`
- `filterValue`
- `sortField`
- `sortOrder` (`asc` | `desc`)

Filtering behavior:
- Mongo: case-insensitive “contains” via regex (with `_id` special-cased).
- MySQL: case-insensitive-ish “contains” via `LIKE ?` (parameterized).

## Auditing

DB Browser endpoints are wrapped with the shared audit middleware, so actions appear in the Audit Log UI and APIs.

See: `docs/features/audit-log.md`.

## UI implementation notes

The UI is a single EJS shell (`views/admin-db-browser.ejs`) with a small Vue-based client (via CDN) that calls the DB Browser admin APIs.

It supports:
- Creating/editing/testing connections
- Browsing DBs + namespaces (collections/tables)
- Viewing records with pagination, sort, and single-field filtering
- Viewing a single record/document in a JSON modal

## MySQL requirements

MySQL browsing uses `mysql2/promise` and requires the remote user to have sufficient privileges for:

- `SHOW DATABASES`
- `SHOW TABLES FROM <db>`
- `SHOW COLUMNS FROM <table>`
- `SELECT ...` on the target tables

If privileges are limited, the DB Browser will only display what the remote user can see.
