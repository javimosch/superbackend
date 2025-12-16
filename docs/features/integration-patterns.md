# Integration patterns

## Use middleware mode (recommended)

Middleware mode is the recommended integration approach. Standalone mode may be deprecated in the future.

### Minimal parent app

```js
require('dotenv').config();
const express = require('express');
const { middleware } = require('./index');

const app = express();

// Important: do NOT apply express.json() to the Stripe webhook path.
// Safest approach: mount SaasBackend before your global body parsers.
app.use(middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN || '*'
}));

// Your app routes can go here.

app.listen(3000);
```

## Mounting under a prefix

If you mount under `/saas`, all SaasBackend routes are prefixed.

```js
app.use('/saas', middleware({ mongodbUri: process.env.MONGODB_URI }));
```

Examples:

- `GET /saas/api/auth/me`
- `POST /saas/api/billing/create-checkout-session`
- `POST /saas/api/stripe/webhook`
- `GET /saas/admin/test`

## Stripe webhooks: raw body gotcha

Stripe signature verification requires the raw request body.

SaasBackend registers webhook handlers using `express.raw({ type: 'application/json' })` for:

- `POST /api/stripe/webhook`
- `POST /api/stripe-webhook` (legacy)

### Rule of thumb

- If your parent app uses `app.use(express.json())` globally, it can break Stripe signature validation.
- Prefer mounting SaasBackend **before** your global JSON body parser.

### If you must keep global body parsing

If your app requires a global parser, you can exclude Stripe webhook paths.

Example pattern:

```js
const express = require('express');

app.use((req, res, next) => {
  if (req.path === '/api/stripe/webhook' || req.path === '/api/stripe-webhook') {
    return next();
  }
  return express.json()(req, res, next);
});

app.use(middleware({ mongodbUri: process.env.MONGODB_URI, skipBodyParser: true }));
```

Note:

- When mounting under a prefix (example `/saas`), webhook paths become `/saas/api/stripe/webhook`.

## CORS patterns

### Let SaasBackend handle CORS

```js
app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: 'https://app.example.com'
}));
```

### Let the parent app handle CORS

```js
app.use(cors({ origin: 'https://app.example.com', credentials: true }));
app.use('/saas', middleware({ mongodbUri: process.env.MONGODB_URI, corsOrigin: false }));
```

## Quick test: healthcheck

```bash
curl http://localhost:3000/health
```

If mounted under `/saas`:

```bash
curl http://localhost:3000/saas/health
```

## Frontend snippets

### Auth: login

```js
async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json(); // { token, refreshToken, user }
}
```

If mounted under `/saas`:

- Use `/saas/api/auth/login`.

### Billing: create checkout session and redirect

```js
async function startCheckout(token, priceId) {
  const res = await fetch('/api/billing/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ priceId })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create checkout session');

  window.location.href = data.url;
}
```

## Admin API: curl pattern

Admin endpoints require basic auth:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" http://localhost:3000/api/admin/users
```

If mounted under `/saas`:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" http://localhost:3000/saas/api/admin/users
```
