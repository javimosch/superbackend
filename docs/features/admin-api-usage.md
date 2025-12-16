# Admin API usage

## What it is

SaasBackend exposes admin endpoints protected by HTTP Basic Auth.

Use these endpoints for:

- Operational scripts
- Internal tools
- Debugging

If you mount SaasBackend under a prefix (example `/saas`), remember to include it in the URL:

- `/saas/api/admin/...`

## Basic auth (copy/paste)

### Using environment variables

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=change-me
```

Then:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" http://localhost:5000/api/admin/users
```

### Inline credentials

```bash
curl -u "admin:change-me" http://localhost:5000/api/admin/users
```

## Pagination conventions

Most list endpoints accept:

- `limit` (default varies)
- `offset`

Example:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/users?limit=50&offset=0"
```

## Common admin endpoints

### Users

List:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/users?limit=50&offset=0&q=gmail"
```

Disable:

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/users/USER_ID/disable"
```

Enable:

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/users/USER_ID/enable"
```

### Global settings

List:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/settings"
```

Set encrypted Stripe key:

```bash
curl -X PUT -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"type":"encrypted","value":"sk_test_...","public":false}' \
  "http://localhost:5000/api/admin/settings/STRIPE_SECRET_KEY"
```

### Feature flags

List:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/feature-flags"
```

Create:

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"key":"new_checkout","enabled":false,"rolloutPercentage":10}' \
  "http://localhost:5000/api/admin/feature-flags"
```

Evaluate (JWT):

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/feature-flags"
```

### Stripe webhooks (monitoring)

Stats:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/stripe-webhooks-stats"
```

Failed events:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/stripe-webhooks?status=failed"
```

Retry failed events:

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "maxRetries": 3}' \
  "http://localhost:5000/api/admin/stripe-webhooks/retry"
```

### Notifications (admin)

Send an in-app notification:

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"userIds":["USER_ID"],"type":"info","title":"Hello","message":"Welcome","channel":"in_app"}' \
  "http://localhost:5000/api/admin/notifications/send"
```

## Troubleshooting

### Getting `401 Authentication required`

- Ensure you are passing basic auth.
- Ensure `ADMIN_USERNAME`/`ADMIN_PASSWORD` match the server configuration.
- If mounted under a prefix, ensure your URL includes it (example `/saas/api/admin/users`).
