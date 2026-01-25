# Admin panel

## What it is

SuperBackend ships with a basic-auth protected admin UI for common operational tasks.

Middleware mode is the recommended integration approach. Standalone mode may be deprecated in the future.

It is intentionally simple and is meant as:

- A starter internal admin panel
- A debugging surface while integrating SuperBackend

## Access

Admin pages are protected by HTTP Basic Auth:

- Username: `ADMIN_USERNAME` (default: `admin`)
- Password: `ADMIN_PASSWORD` (default: `admin`)

## Admin UI routes

Common pages:

- `/admin/users`
- `/admin/organizations`
- `/admin/notifications`
- `/admin/global-settings`
- `/admin/feature-flags`
- `/admin/stripe-pricing`
- `/admin/metrics`
- `/admin/audit`
- `/admin/errors`
- `/admin/forms`
- `/admin/waiting-list`
- `/admin/json-configs`
- `/admin/seo-config`
- `/admin/i18n`
- `/admin/assets`
- `/admin/db-browser`
- `/admin/test` (admin testing UI)

If you mount in middleware mode under a prefix (for example `/saas`), URLs become:

- `/saas/admin/users`

## Admin API routes

Admin APIs are also basic-auth protected.

### Authentication

```bash
curl -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  ${BASE_URL}/api/admin/users
```

### Pagination & Search

Most list endpoints accept:

- `limit` (default: 50, max: 500)
- `offset` (default: 0)
- `q`: Search query (where applicable)

Example:

```bash
curl -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  "${BASE_URL}/api/admin/users?limit=50&offset=0&q=gmail"
```

### Common Admin APIs

| Area | Path |
|------|------|
| Users | `/api/admin/users/*` |
| Organizations | `/api/admin/orgs/*` |
| Notifications | `/api/admin/notifications/*` |
| Global Settings | `/api/admin/settings/*` |
| Feature Flags | `/api/admin/feature-flags/*` |
| Stripe | `/api/admin/stripe/*` |
| Audit Logs | `/api/admin/audit/*` |
| Error Logs | `/api/admin/errors/*` |

## User Management

The admin UI and APIs allow you to:
- List and search users.
- View user details and subscription status.
- Update user roles and passwords.
- Disable/Enable accounts (soft-disable).
- Reconcile Stripe subscriptions.

**Example: Disable user**
```bash
curl -X POST -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  "${BASE_URL}/api/admin/users/USER_ID/disable"
```

## Notifications

Send messages to users via in-app notifications or email.

**Example: Send notification**
```bash
curl -X POST -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  -H "Content-Type: application/json" \
  -d '{
    "userIds": ["USER_ID"],
    "type": "info",
    "title": "Hello",
    "message": "Welcome to SuperBackend",
    "channel": "in_app"
  }' \
  "${BASE_URL}/api/admin/notifications/send"
```

Channels:
- `in_app`: Stored in DB, retrieved by user.
- `email`: Sent via configured email provider.
- `both`: Both channels.

## Developer notes

- Prefer the admin UI for manual operations.
- Prefer the admin APIs for scripting.

## References

- `docs/features/global-settings.md`
- `docs/features/admin-users-notifications.md`
- `docs/features/stripe-pricing-management.md`
- `docs/features/stripe-webhook-improvements.md`
