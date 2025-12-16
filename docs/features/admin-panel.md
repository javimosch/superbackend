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

- `/admin/test` (admin testing UI)
- `/admin/global-settings`
- `/admin/feature-flags`
- `/admin/users`
- `/admin/notifications`
- `/admin/stripe-pricing`

If you mount in middleware mode under a prefix (for example `/saas`), URLs become:

- `/saas/admin/test`

## Admin API routes

Admin APIs are also basic-auth protected.

Examples:

- `/api/admin/users/*`
- `/api/admin/notifications/*`
- `/api/admin/stripe/*`
- `/api/admin/stripe-webhooks*`

## Developer notes

- Prefer the admin UI for manual operations.
- Prefer the admin APIs for scripting.

## References

- `docs/features/global-settings.md`
- `docs/features/admin-users-notifications.md`
- `docs/features/stripe-pricing-management.md`
- `docs/features/stripe-webhook-improvements.md`
