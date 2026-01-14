# Getting started

This guide assumes you are consuming **SuperBackend as an npm package** and mounting it into your existing Express app (recommended).

## Install

```bash
npm i @intranefr/superbackend
```

## Minimal setup (middleware mode)

Create an Express app and mount SuperBackend under a prefix (example: `/saas`).

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

### Required environment variables

At minimum:

- `MONGODB_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

If you use global settings encryption:

- `SUPERBACKEND_ENCRYPTION_KEY`

## Verify it’s running

```bash
curl http://localhost:3000/saas/health
```

You should see a JSON response with `status: "ok"`.

## Get your first JWT

There are two common ways to bootstrap a token for development.

### Option A: Register + login (recommended)

Register:

```bash
curl -X POST http://localhost:3000/saas/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"dev-password","name":"Dev"}'
```

Login:

```bash
curl -X POST http://localhost:3000/saas/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"dev-password"}'
```

Use the returned access token as:

```bash
-H "Authorization: Bearer $JWT"
```

### Option B: Admin generate-token (dev/test)

If enabled in your build, you can generate a token using basic auth:

```bash
curl -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  -X POST http://localhost:3000/saas/api/admin/generate-token \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com"}'
```

## Open the admin UI

Admin pages are protected by **HTTP Basic Auth**.

Useful admin UIs:

- `/saas/admin/test`
- `/saas/admin/users`
- `/saas/admin/feature-flags`
- `/saas/admin/i18n`

## Next steps

- Auth details: `docs/features/auth-and-jwt.md`
- CORS + mounting patterns: `docs/features/integration-patterns.md`
- Global settings: `docs/features/global-settings.md`
- Feature flags: `docs/features/feature-flags.md`
- JSON configs: `docs/features/json-configs.md`
- File storage (assets): `docs/features/file-storage.md`
- Billing setup: `docs/features/billing-and-subscriptions.md`
