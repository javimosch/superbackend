# Middleware mode

## What it is
Middleware mode lets you mount SuperBackend inside an existing Express app, instead of running it as its own server.

Middleware mode is the recommended integration approach. Standalone mode may be deprecated in the future.

This is useful when:
- You already have an API server and want SuperBackend under a route prefix (for example `/saas`).
- You want to share infrastructure (reverse proxy, auth, logging, deployment) with a parent app.

## Standalone vs middleware
- **Standalone**: SuperBackend owns the Express app and listens on its own port.
- **Middleware**: SuperBackend returns an Express router that you mount into a parent Express app.

## Basic usage

Mount SuperBackend under `/saas`:

```js
const express = require('express');
const { middleware } = require('@intranefr/superbackend');

const app = express();

app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN || '*'
}));

app.listen(3000);
```

Verify:

```bash
curl ${BASE_URL}/health
curl -i ${BASE_URL}/api/auth/me
```

Notes:

- `GET /saas/health` should return JSON with `status: "ok"`.
- `GET /saas/api/auth/me` should return `401` if you did not send a JWT (this confirms routing is correct).

## Configuration

Middleware mode accepts an options object.

### `mongodbUri`
MongoDB connection string.
- If provided, SuperBackend can connect using it.
- If not provided, SuperBackend falls back to `process.env.MONGODB_URI`.

### `corsOrigin`
Controls CORS behavior.
Supported formats:
- `'*'` (allow all)
- `'https://example.com'` (single origin)
- `'https://a.com,https://b.com'` (comma-separated list)

## Important routing notes

When you mount the router at `/saas`, all SuperBackend routes are prefixed.

Examples:
- Health check: `GET /saas/health`
- Public API: `POST /saas/api/auth/login`
- Admin UI: `GET /saas/admin/test`

## Admin UI and assets

In middleware mode, SuperBackend intentionally avoids changing your parent app’s view engine configuration.

That means:
- Admin HTML pages are rendered without calling `app.set('view engine', ...)` on your app.
- Admin static assets are served under the SuperBackend mount.

Example (when mounted at `/saas`):
- Admin UI: `GET /saas/admin/test`
- Admin assets: `GET /saas/admin/assets/...`

## Authentication

Admin endpoints and admin UI are protected by basic auth.
If you mount under a prefix, the protection still applies (for example `/saas/admin/*`).

## Troubleshooting

### 404s after mounting
Make sure you’re calling `app.use('/your-prefix', middleware(...))` and you’re hitting URLs with the prefix.

### DB connection errors
- Confirm `mongodbUri` is passed or `MONGODB_URI` is set.
- Confirm your parent app isn’t terminating the process before the connection is established.

### CORS issues
- If you’re serving a frontend from a different origin, set `corsOrigin` accordingly.
- If you’re testing locally, `corsOrigin: '*'` is a good first check.

### Admin pages render but look unstyled
Ensure the mount path is correct and you can fetch admin assets (for example `GET /saas/admin/assets/...`).

