# Error tracking

## What it is

This feature provides aggregated error tracking (frontend + backend) stored in MongoDB.

It is intended for apps that mount `saasbackend` as Express middleware and want:

- A frontend hook to report client-side errors.
- A server-side aggregation layer (fingerprinting + samples) for debugging.
- An admin-only UI to triage errors.

## Base URL / mount prefix

When you mount the middleware under a prefix (example: `/saas`), **all routes are prefixed**.

Example:

- Without prefix: `POST /api/log/error`
- With prefix: `POST /saas/api/log/error`

In this document we use `${BASE_URL}` which should include the mount prefix.

## Configuration

### Environment variables

- `ERROR_TRACKING_ENABLED`
  - Optional
  - Default: enabled (anything except `false`)
- `ERROR_MAX_SAMPLES`
  - Optional
  - Default: `20`
- `ERROR_SAMPLE_RATE_PERCENT`
  - Optional
  - Default: `100`
- `ERROR_RATE_LIMIT_PER_MINUTE`
  - Optional
  - Default: `30`
- `ERROR_RATE_LIMIT_ANON_PER_MINUTE`
  - Optional
  - Default: `10`
- `EXIT_ON_UNCAUGHT_EXCEPTION`
  - Optional
  - Default: `false`
  - If set to `true`, the process will `exit(1)` after logging an `uncaughtException`.

### Headers

- `X-Request-Id`
  - If the client provides it, `saasbackend` will propagate it.
  - If not provided, `saasbackend` will generate one and echo it back in responses.

## API

### Public (no auth)

#### `POST /api/log/error`

Report a frontend error. This is intended to be called from browsers.

- Rate-limited per IP.
- If a Bearer token is provided, the event is attributed to that user.

Request body (representative):

```json
{
  "severity": "error",
  "errorName": "TypeError",
  "message": "Cannot read properties of undefined (reading 'x')",
  "stack": "TypeError: ...\n at ...",
  "url": "https://app.example.com/settings",
  "referrer": "https://app.example.com/",
  "request": {
    "method": "GET",
    "path": "/settings",
    "statusCode": 200,
    "requestId": "..."
  },
  "runtime": {
    "viewport": "1366x768",
    "locale": "en",
    "appVersion": "1.2.3"
  },
  "extra": {
    "feature": "settings"
  }
}
```

Example (anonymous):

```bash
curl -X POST "${BASE_URL}/api/log/error" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: ${REQUEST_ID}" \
  -d '{"severity":"error","errorName":"TypeError","message":"boom","stack":"...","url":"https://app.example.com"}'
```

Example (attributed to a user via JWT):

```bash
curl -X POST "${BASE_URL}/api/log/error" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"severity":"error","errorName":"TypeError","message":"boom","stack":"..."}'
```

Response:

- `200`:

```json
{ "ok": true, "tracked": true }
```

- `429`:

```json
{ "error": "Too many error reports. Please try again later." }
```

### User (JWT)

If you include `Authorization: Bearer ${TOKEN}` when calling `POST /api/log/error`, the error is attributed to that user.

### Admin (Basic Auth)

#### Error tracking admin APIs

- `GET /api/admin/errors`
- `GET /api/admin/errors/stats`
- `GET /api/admin/errors/:id`
- `PUT /api/admin/errors/:id/status`
- `DELETE /api/admin/errors/:id`

Example:

```bash
curl -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  "${BASE_URL}/api/admin/errors/stats"
```

## Admin UI

### Error tracking UI

- Route: `GET /admin/errors`
- Requirements: Basic Auth

It can:

- Browse error aggregates
- Filter/search
- View samples + stack traces
- Change status (open/ignored/resolved)

## Frontend integration

### Browser SDK (recommended)

You can install the browser SDK with a single script tag. It will attach to `window.saasbackend` (creating it if missing), and create `saasbackend.errorTracking`.

```html
<script src="${BASE_URL}/api/error-tracking/browser-sdk"></script>
```

Notes:

- Default endpoint: `POST /api/log/error`
- If you mount the middleware under a prefix, `${BASE_URL}` should include it.
- The embed SDK is served with `Cache-Control: no-cache` to support iterative development.

#### Identify user: pass a JWT bearer header

```js
saasbackend.errorTracking.config({
  headers: { authorization: `Bearer ${token}` }
})
```

#### Identify user: provide a dynamic auth header getter

```js
saasbackend.errorTracking.config({
  getAuthHeader: () => `Bearer ${token}`
})
```

### Future npm package (bundlers)

Planned package:

- `@saasbackend/sdk/error-tracking/browser`

Example usage:

```js
import { createErrorTrackingClient } from '@saasbackend/sdk/error-tracking/browser';

const client = createErrorTrackingClient({
  endpoint: '/api/log/error',
  headers: { authorization: `Bearer ${token}` },
});

client.init();
```

### Report JS runtime errors (window.onerror)

```js
function postFrontendError(payload) {
  return fetch(`${BASE_URL}/api/log/error`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': payload?.request?.requestId || crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

window.addEventListener('error', (event) => {
  postFrontendError({
    severity: 'error',
    errorName: event?.error?.name || 'Error',
    message: event?.message || String(event?.error?.message || 'Unknown error'),
    stack: event?.error?.stack,
    url: window.location.href,
    referrer: document.referrer,
    runtime: {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      locale: navigator.language,
    },
  });
});
```

### Report unhandled promise rejections

```js
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

  fetch(`${BASE_URL}/api/log/error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      severity: 'error',
      errorName: err.name || 'UnhandledRejection',
      message: err.message,
      stack: err.stack,
      url: window.location.href,
      referrer: document.referrer,
    }),
    keepalive: true,
  }).catch(() => {});
});
```

### Include the user token (recommended)

If your frontend has a JWT access token, include it to attribute errors to a user:

```js
fetch(`${BASE_URL}/api/log/error`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ severity: 'error', errorName: 'Error', message: '...', stack: '...' }),
  keepalive: true,
});
```

## Common errors / troubleshooting

- If `POST /api/log/error` returns `429`:
  - Reduce volume (dedupe client-side)
  - Increase `ERROR_RATE_LIMIT_PER_MINUTE` / `ERROR_RATE_LIMIT_ANON_PER_MINUTE`
- If you don’t see `X-Request-Id`:
  - Confirm you are hitting the middleware mount path (prefix issues)
  - Confirm nothing in the host app strips response headers

## Next steps

- Audit log feature: `docs/features/audit-log.md`
