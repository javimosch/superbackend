# Headless CMS

## What it is

Headless CMS lets you define dynamic Mongo-backed tables (models) at runtime and then CRUD data (collections) through:

- Admin UI (`/admin/headless`)
- Server-to-server or browser-to-server APIs (`/api/headless/*`) guarded by API tokens

All headless collection names in MongoDB are **prefixed**:

- `headless_<modelCode>` (transparent in the Admin UI)

Headless CMS also supports **external models** imported from existing Mongo collections:

- External models use `codeIdentifier` prefix `ext_...`
- External models bind to the underlying Mongo collection defined by `sourceCollectionName`
- External models are schema **read-only** in the Admin UI (schema is inferred and refreshed via sync)

## Base URL / mount prefix

If SuperBackend is mounted under a prefix (example `/saas`), every route below is prefixed.

Example:

- `GET /admin/headless` becomes `GET /saas/admin/headless`
- `GET /api/headless/posts` becomes `GET /saas/api/headless/posts`

## Admin UI

- `GET /admin/headless` (basic auth)

What it can do:

- Define tables (schema editor)
- Define tables via advanced JSON (validate + save)
- Use AI assistance to propose multi-model changes (creates + updates) and apply them (best-effort)
- CRUD table rows (editable grid)
- Create API tokens + per-table permissions
- Copy/paste cURL examples
- Execute API requests from the Admin UI via a test form (uses real `/api/headless/*` endpoints through an admin proxy)

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

Advanced model helpers:

- `POST /api/admin/headless/models/validate`
- `POST /api/admin/headless/models/apply`

AI model builder:

- `POST /api/admin/headless/ai/model-builder/chat`

External models (Mongo collections):

- `GET /api/admin/headless/external/collections`
- `POST /api/admin/headless/external/infer`
- `POST /api/admin/headless/external/import`
- `POST /api/admin/headless/models/:codeIdentifier/sync`

## Model definition JSON

### Shape

```json
{
  "codeIdentifier": "posts",
  "displayName": "Posts",
  "description": "Blog posts",
  "fields": [
    {
      "name": "title",
      "type": "string",
      "required": true,
      "unique": false,
      "default": "",
      "validation": { "minLength": 3, "maxLength": 200 }
    },
    {
      "name": "author",
      "type": "ref",
      "refModelCode": "users"
    },
    {
      "name": "tags",
      "type": "ref[]",
      "refModelCode": "tags"
    }
  ],
  "indexes": [
    { "fields": { "title": 1 }, "options": { "unique": true } }
  ]
}
```

### Supported field types

- `string`
- `number`
- `boolean`
- `date`
- `object`
- `array`
- `ref` (requires `refModelCode`)
- `ref[]` (requires `refModelCode`)

### Validation keys

- Number: `min`, `max`
- String: `minLength`, `maxLength`, `enum`, `match`

### Notes

- Reserved field names: `_id`, `_headlessModelCode`, `_headlessSchemaVersion`
- Server-owned fields in JSON input are ignored with warnings: `version`, `fieldsHash`, `previousFields`, `previousIndexes`, `isActive`, timestamps

## Proposal apply (best-effort)

`POST /api/admin/headless/models/apply` applies multiple model operations in one request.

Request:

```json
{
  "creates": [ { "...full model definitions...": true } ],
  "updates": [
    {
      "codeIdentifier": "posts",
      "ops": [
        { "op": "addField", "field": { "name": "slug", "type": "string", "unique": true } },
        { "op": "addIndex", "index": { "fields": { "slug": 1 }, "options": { "unique": true } } }
      ]
    }
  ]
}
```

Supported patch ops:

- `setDisplayName`
- `setDescription`
- `addField`
- `removeField`
- `replaceField` (rename is not supported)
- `addIndex`
- `removeIndex`

Response includes `created`, `updated`, and aggregated `errors`/`warnings`.

Admin collections (UI helper APIs):

- `GET /api/admin/headless/collections/:modelCode`
- `POST /api/admin/headless/collections/:modelCode`
- `PUT /api/admin/headless/collections/:modelCode/:id`
- `DELETE /api/admin/headless/collections/:modelCode/:id`

Admin API test execution:

- `POST /api/admin/headless/collections-api-test`

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

## API test execution (Admin UI)

The Admin UI provides a test form that executes real Headless CRUD requests by calling:

- `POST /api/admin/headless/collections-api-test`

The server performs the request against the corresponding `/api/headless/:modelCode` endpoint using the provided API token and returns the downstream response to the UI.

Each test execution is logged to the audit system with action:

- `headless.collections_api_test`

The audit event includes request and response metadata (scrubbed) and stores a truncated response preview (10KB) in `meta`.

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
