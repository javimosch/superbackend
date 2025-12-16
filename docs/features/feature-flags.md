# Feature flags

## What it is

Feature flags let you enable/disable functionality dynamically without redeploying.

In this backend, feature flags are:

- **Stored in MongoDB** (backed by `GlobalSetting` records).
- **Evaluated server-side** (clients cannot force-enable a flag).
- Managed via:
  - Admin UI: `/admin/feature-flags`
  - Admin API: `/api/admin/feature-flags/*`
  - User evaluation API (JWT): `GET /api/feature-flags`

## Storage model

Each flag is stored as a `GlobalSetting` JSON value under a prefixed key:

- `FEATURE_FLAG.<flagKey>`

Example payload:

```json
{
  "description": "Enable new checkout",
  "enabled": false,
  "rolloutPercentage": 10,
  "allowListUserIds": ["<mongoObjectId>"],
  "allowListOrgIds": [],
  "denyListUserIds": [],
  "denyListOrgIds": [],
  "payload": { "variant": "A" }
}
```

## API

### Public evaluation (no auth)

Use this endpoint when you need flags in **not-logged user-facing views** (marketing/landing pages) and you cannot rely on a JWT.

```
GET /api/feature-flags/public
```

Optional org targeting can be provided via:

- Query param: `?orgId=...`
- Header: `x-org-id: ...`

Optional anonymous stickiness for percentage rollouts:

- Query param: `?anonId=...`
- Header: `x-anon-id: ...`

Example:

```bash
curl "http://localhost:5000/api/feature-flags/public"
```

Response shape:

```json
{ "flags": { "some_flag": { "enabled": true, "payload": { "variant": "A" } } } }
```

### User evaluation (JWT)

This endpoint **requires JWT**.

```
GET /api/feature-flags
Authorization: Bearer <token>
```

Optional org targeting can be provided via:

- Query param: `?orgId=...`
- Header: `x-org-id: ...`

Example:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/feature-flags"
```

Example with org:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  -H "x-org-id: ORG_ID" \
  "http://localhost:5000/api/feature-flags"
```

Response shape:

```json
{ "flags": { "some_flag": { "enabled": true, "payload": { "variant": "A" } } } }
```

### Admin CRUD (basic auth)

```
GET    /api/admin/feature-flags
GET    /api/admin/feature-flags/:key
POST   /api/admin/feature-flags
PUT    /api/admin/feature-flags/:key
DELETE /api/admin/feature-flags/:key
```

List:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/feature-flags"
```

Create:

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "new_checkout",
    "description": "Enable new checkout",
    "enabled": false,
    "rolloutPercentage": 10,
    "allowListUserIds": [],
    "allowListOrgIds": [],
    "denyListUserIds": [],
    "denyListOrgIds": [],
    "payload": { "variant": "A" }
  }' \
  "http://localhost:5000/api/admin/feature-flags"
```

Update:

```bash
curl -X PUT -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "rolloutPercentage": 100}' \
  "http://localhost:5000/api/admin/feature-flags/new_checkout"
```

Delete:

```bash
curl -X DELETE -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/feature-flags/new_checkout"
```

## Admin UI

Open:

```
GET /admin/feature-flags
```

If mounted under a prefix (example `/saas`):

- `/saas/admin/feature-flags`

## EJS helper (server-rendered views)

Feature flags are also available directly in EJS templates without making any HTTP call.

Injected locals:

- `featureFlags` (map)
- `ff(key, defaultValue=false)` (boolean)
- `ffPayload(key, defaultValue=null)` (any)

Example:

```ejs
<% if (ff('new_checkout')) { %>
  <a href="/checkout">Try the new checkout</a>
<% } %>

<% const variant = ffPayload('new_checkout')?.variant; %>
```

Notes:

- The middleware sets a cookie `saas_anon_id` (if missing) to keep percentage rollouts stable for anonymous visitors.
- If you mount SaasBackend under a prefix (example `/saas`), EJS locals still work the same way; only your URLs change.

## Troubleshooting

### Getting `401 No token provided` on `/api/feature-flags`

That endpoint requires JWT. Send:

- `Authorization: Bearer <token>`

### Feature flag changes don’t show up

- Ensure you’re editing the correct environment/database.
- If you’re using org-based evaluation, confirm `x-org-id` / `orgId` are set as expected.
