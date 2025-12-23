# Middleware quickstart

## What it is
Quick start guide for mounting SaasBackend into an existing Express app. This is the recommended integration path.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:

- Health: `GET ${BASE_URL}/health`
- Auth: `POST ${BASE_URL}/api/auth/login`
- Admin: `GET ${BASE_URL}/admin/test`

## Configuration
- `mongodbUri` (optional): MongoDB connection string
- `corsOrigin` (optional): CORS origin(s) - supports `*`, single origin, or comma-separated

## API
### Public endpoints
- `POST ${BASE_URL}/api/auth/register`
- `POST ${BASE_URL}/api/auth/login`
- `GET ${BASE_URL}/health`

### JWT endpoints
- `GET ${BASE_URL}/api/auth/me`
- `POST ${BASE_URL}/api/billing/create-checkout-session`
- `GET ${BASE_URL}/api/notifications`

### Admin endpoints (Basic Auth)
- `GET ${BASE_URL}/admin/test`
- `GET ${BASE_URL}/admin/users`
- `GET ${BASE_URL}/admin/global-settings`

## Admin UI
- `/saas/admin/test` - API testing UI
- `/saas/admin/users` - User management
- `/saas/admin/global-settings` - Settings manager

## Common errors / troubleshooting
- **404 after mounting**: Ensure you're hitting the prefixed path (e.g., `/saas/health`)
- **CORS errors**: Set `corsOrigin` or disable CORS in middleware mode
- **DB connection errors**: Pass `mongodbUri` or set `MONGODB_URI` environment variable
