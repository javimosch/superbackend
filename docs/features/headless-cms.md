# Headless CMS

## What it is

Headless CMS lets you define dynamic Mongo-backed tables (models) at runtime and then CRUD data (collections) through:

- Admin UI (`/admin/headless`)
- Server-to-server or browser-to-server APIs (`/api/headless/*`) guarded by API tokens

All headless collection names in MongoDB are **prefixed**:

- `headless_<modelCode>` (transparent in the Admin UI)

## Base URL / mount prefix

If SaasBackend is mounted under a prefix (example `/saas`), every route below is prefixed.

Example:

- `GET /admin/headless` becomes `GET /saas/admin/headless`
- `GET /api/headless/posts` becomes `GET /saas/api/headless/posts`

## Admin UI

- `GET /admin/headless` (basic auth)

What it can do:

- Define tables (schema editor)
- CRUD table rows (editable grid)
- Create API tokens + per-table permissions
- Copy/paste cURL examples

## API

### Authentication

Headless CRUD APIs require an API token.

Supported headers:

- `Authorization: Bearer <token>`
- `X-API-Token: <token>`
- `X-API-Key: <token>`

### Admin APIs (basic auth)

Model definitions:

- `GET /api/admin/headless/models`
- `POST /api/admin/headless/models`
- `GET /api/admin/headless/models/:codeIdentifier`
- `PUT /api/admin/headless/models/:codeIdentifier`
- `DELETE /api/admin/headless/models/:codeIdentifier`

Admin collections (UI helper APIs):

- `GET /api/admin/headless/collections/:modelCode`
- `POST /api/admin/headless/collections/:modelCode`
- `PUT /api/admin/headless/collections/:modelCode/:id`
- `DELETE /api/admin/headless/collections/:modelCode/:id`

API tokens:

- `GET /api/admin/headless/tokens`
- `POST /api/admin/headless/tokens`
- `GET /api/admin/headless/tokens/:id`
- `PUT /api/admin/headless/tokens/:id`
- `DELETE /api/admin/headless/tokens/:id`

### Public CRUD APIs (API token)

- `GET /api/headless/:modelCode`
- `POST /api/headless/:modelCode`
- `GET /api/headless/:modelCode/:id`
- `PUT /api/headless/:modelCode/:id`
- `DELETE /api/headless/:modelCode/:id`

Query params (GET list):

- `limit` (default 50, max 200)
- `skip` (default 0)
- `filter` (JSON string)
- `sort` (JSON string)
- `populate` (comma-separated fields)

## cURL examples

Export env vars:

```bash
export BASE_URL="http://localhost:3000/saas"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="admin"
```

Create a table (model):

```bash
curl -s -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  -X POST "${BASE_URL}/api/admin/headless/models" \
  -H "Content-Type: application/json" \
  -d '{
    "codeIdentifier": "posts",
    "displayName": "Posts",
    "fields": [
      {"name":"title","type":"string","required":true},
      {"name":"published","type":"boolean","default":false},
      {"name":"publishedAt","type":"date"}
    ]
  }' | jq
```

Create an API token:

```bash
curl -s -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  -X POST "${BASE_URL}/api/admin/headless/tokens" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "website",
    "ttlSeconds": 3600,
    "permissions": [
      {"modelCode":"posts","operations":["create","read","update","delete"]}
    ]
  }' | jq
```

List rows:

```bash
export API_TOKEN="<paste token here>"

curl -s "${BASE_URL}/api/headless/posts?limit=10&skip=0" \
  -H "Authorization: Bearer ${API_TOKEN}" | jq
```

Create row:

```bash
curl -s -X POST "${BASE_URL}/api/headless/posts" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","published":false}' | jq
```

Update row:

```bash
export ID="<row id>"

curl -s -X PUT "${BASE_URL}/api/headless/posts/${ID}" \
  -H "X-API-Token: ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"published":true}' | jq
```

Delete row:

```bash
curl -s -X DELETE "${BASE_URL}/api/headless/posts/${ID}" \
  -H "X-API-Token: ${API_TOKEN}" | jq
```
