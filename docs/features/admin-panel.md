# Admin panel

## What it is

SaasBackend ships with a basic-auth protected admin UI for common operational tasks.

Middleware mode is the recommended integration approach. Standalone mode may be deprecated in the future.

It is intentionally simple and is meant as:

- A starter internal admin panel
- A debugging surface while integrating SaasBackend

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
- `/admin/test` (admin testing UI)

If you mount in middleware mode under a prefix (for example `/saas`), URLs become:

- `/saas/admin/users`

## Admin API routes

Admin APIs are also basic-auth protected.

**Example request:**

```bash
curl -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  ${BASE_URL}/api/admin/users
```

Examples:

- `/api/admin/users/*`
- `/api/admin/notifications/*`
- `/api/admin/stripe/*`
- `/api/admin/stripe-webhooks*`
- `/api/admin/orgs/*`
- `/api/admin/settings/*`

## Developer notes

- Prefer the admin UI for manual operations.
- Prefer the admin APIs for scripting.

## References

- `docs/features/global-settings.md`
- `docs/features/admin-users-notifications.md`
- `docs/features/stripe-pricing-management.md`
- `docs/features/stripe-webhook-improvements.md`
