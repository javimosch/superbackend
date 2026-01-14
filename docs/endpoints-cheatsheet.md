## API Endpoints Cheatsheet (LLM-friendly)

This file is a compact, current snapshot of the SuperBackend API surface.

Only the sections above the "Legacy appendix" are intended to be used by LLMs.

## Base URL / mounting

If you mount SuperBackend under a prefix (example `/saas`), **every path below becomes prefixed**:

- `/saas/api/...`
- `/saas/admin/...`
- `/saas/public/...`

Health:

- `GET /health` (or `GET /saas/health`)

## Authentication types

- **Public**: no auth header
- **JWT**: `Authorization: Bearer <token>`
- **Admin**: HTTP Basic Auth (`ADMIN_USERNAME` / `ADMIN_PASSWORD`)

## Public endpoints

- **Auth**
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh-token`
- **Public settings**
  - `GET /api/settings/public`
- **Public JSON configs**
  - `GET /api/json-configs/:slug`
  - `GET /api/json-configs/:slug?raw=true`
- **Public assets proxy** (serves only `visibility=public`)
  - `GET /public/assets/*`

## JWT endpoints

- **Auth**
  - `GET /api/auth/me`

- **Billing / subscriptions (Stripe)**
  - `POST /api/billing/create-checkout-session`
  - `POST /api/billing/create-portal-session`
  - `POST /api/billing/reconcile-subscription`

- **User**
  - `PUT /api/user/profile`
  - `PUT /api/user/password`
  - `DELETE /api/user/account`
  - `GET /api/user/settings`
  - `PUT /api/user/settings`
  - `POST /api/user/password-reset-request` (public)
  - `POST /api/user/password-reset-confirm` (public)

- **Notifications / activity**
  - `GET /api/notifications`
  - `PUT /api/notifications/:id/read`
  - `GET /api/activity-log`
  - `POST /api/activity-log`

- **Feature flags**
  - `GET /api/feature-flags` (evaluated flags for current user)
  - `GET /api/feature-flags/public` (anonymous evaluation)

- **Assets**
  - `POST /api/assets/upload` (multipart)
  - `GET /api/assets`
  - `GET /api/assets/:id`
  - `GET /api/assets/:id/download`
  - `DELETE /api/assets/:id`

## Admin (basic auth) endpoints

- **Admin UI pages**
  - `GET /admin/test`
  - `GET /admin/users`
  - `GET /admin/stripe-pricing`
  - `GET /admin/feature-flags`
  - `GET /admin/assets`
  - `GET /admin/json-configs`
  - `GET /admin/i18n`
  - `GET /admin/global-settings`

- **Admin core**
  - `POST /api/admin/generate-token`

- **Admin settings**
  - `GET /api/admin/settings`
  - `GET /api/admin/settings/:key`
  - `POST /api/admin/settings`
  - `PUT /api/admin/settings/:key`
  - `DELETE /api/admin/settings/:key`

- **Admin feature flags**
  - `GET /api/admin/feature-flags`
  - `GET /api/admin/feature-flags/:key`
  - `POST /api/admin/feature-flags`
  - `PUT /api/admin/feature-flags/:key`
  - `DELETE /api/admin/feature-flags/:key`

- **Admin assets**
  - `GET /api/admin/assets/info`
  - `GET /api/admin/assets`
  - `GET /api/admin/assets/:id`
  - `POST /api/admin/assets/upload` (multipart)
  - `PATCH /api/admin/assets/:id`
  - `DELETE /api/admin/assets/:id`

- **Admin upload namespaces**
  - `GET /api/admin/upload-namespaces`
  - `GET /api/admin/upload-namespaces/summary`
  - `GET /api/admin/upload-namespaces/:key`
  - `POST /api/admin/upload-namespaces`
  - `PUT /api/admin/upload-namespaces/:key`
  - `DELETE /api/admin/upload-namespaces/:key`
  - `PUT /api/admin/settings/MAX_FILE_SIZE_HARD_CAP`

- **Admin JSON configs**
  - `GET /api/admin/json-configs`
  - `GET /api/admin/json-configs/:id`
  - `POST /api/admin/json-configs`
  - `PUT /api/admin/json-configs/:id`
  - `POST /api/admin/json-configs/:id/regenerate-slug`
  - `POST /api/admin/json-configs/:id/clear-cache`
  - `DELETE /api/admin/json-configs/:id`

- **Stripe webhooks (admin visibility)**
  - `GET /api/admin/stripe-webhooks`
  - `GET /api/admin/stripe-webhooks/:id`

- **Stripe pricing management (admin)**
  - `GET /api/admin/stripe/status`
  - `GET /api/admin/stripe/catalog`
  - `POST /api/admin/stripe/catalog/upsert`
  - `POST /api/admin/stripe/catalog/import`

## Stripe webhooks (no auth)

- `POST /api/stripe/webhook`
- `POST /api/stripe-webhook` (legacy)

## References

For details and copy/paste examples, prefer `docs/features/*`:

- `docs/features/getting-started.md`
- `docs/features/core-configuration.md`
- `docs/features/admin-api-usage.md`
- `docs/features/file-storage.md`

---

## Legacy appendix (deprecated)

The previous long-form “how to add endpoints” guide was removed to keep this file small.

If you need implementation patterns:

- Prefer `docs/features/*` for the current public-facing docs.
- Use git history to recover the older internal guide.
