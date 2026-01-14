# Core configuration

## Recommendation: middleware-first

SuperBackend supports two integration modes:

- **Middleware mode (recommended):** mount SuperBackend into an existing Express app.
- **Standalone mode:** run SuperBackend as its own server.

**Middleware mode is the recommended integration path.** Standalone mode may be deprecated in the future.

## Getting started (npm package)

SuperBackend is published as an npm package and can be mounted into your existing Express app.

Install:

```bash
npm i @intranefr/superbackend
```

Minimal middleware mode setup:

```js
const express = require('express');
const { middleware } = require('@intranefr/superbackend');

const app = express();

app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN,
}));

app.listen(3000);
```

Verify it’s running:

```bash
curl ${BASE_URL}/health
```

Next steps:

- Configure auth and generate tokens: `docs/features/auth-and-jwt.md`
- Configure admin access: `docs/features/admin-panel.md`
- Configure Stripe billing: `docs/features/billing-and-subscriptions.md`
- JSON configs: `docs/features/json-configs.md`
- File storage (assets): `docs/features/file-storage.md`

## Required configuration

### MongoDB

You must provide a MongoDB connection string.

- `MONGODB_URI`

In middleware mode you can alternatively pass `mongodbUri` to `middleware({ mongodbUri })`.

### JWT secrets

Auth uses JWTs. Set strong secrets in production:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

### Admin basic auth

Admin pages and admin APIs are protected by HTTP basic auth:

- `ADMIN_USERNAME` (default: `admin`)
- `ADMIN_PASSWORD` (default: `admin`)

## Common configuration

### CORS

Standalone and middleware use CORS with:

- `CORS_ORIGIN` (or `corsOrigin` option in middleware mode)

Supported values:

- `*`
- `https://example.com`
- `https://a.com,https://b.com`

If you handle CORS in the parent app, disable SuperBackend CORS in middleware mode:

```js
app.use('/saas', middleware({ corsOrigin: false }));
```

### Stripe

Billing requires:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

`STRIPE_SECRET_KEY` can be configured via env var **or** global settings (encrypted).

Redirect URLs:

- `PUBLIC_URL`
- `BILLING_RETURN_URL_RELATIVE`

See:

- `docs/features/billing-and-subscriptions.md`
- `docs/features/stripe-pricing-management.md`

### Email (optional)

Email uses Resend when configured:

- `RESEND_API_KEY`

This can come from env var or global settings.

See:

- `docs/features/email-system.md`

## Global settings (DB-backed)

Global settings are stored in MongoDB and can be accessed via:

- Admin/basic-auth API: `/api/admin/settings/*`
- Public & mixed routes API: `/api/settings/*`

Encrypted settings require:

- `SAASBACKEND_ENCRYPTION_KEY`

See:

- `docs/features/global-settings.md`

Feature flags are built on top of global settings:

- `docs/features/feature-flags.md`

## Mode-specific notes

### Middleware mode

Mounting under a prefix (example `/saas`) prefixes all routes:

- `GET /saas/api/auth/me`
- `POST /saas/api/billing/create-checkout-session`
- `GET /saas/admin/test`

Body parsing:

- Stripe webhooks require a raw body. If your parent app already adds `express.json()`, ensure Stripe webhook route keeps raw body handling (see middleware docs).

See:

- `docs/features/middleware-mode.md`

### Standalone mode

Standalone runs its own Express server and owns middleware ordering (body parsing, CORS, etc.).

Because middleware mode is the recommended integration path, consider using standalone only for quick local testing.
