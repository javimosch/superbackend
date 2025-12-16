# Production checklist

## Goal

This checklist is a copy/paste oriented set of steps to harden SaasBackend for production.

Middleware mode is the recommended integration approach. Standalone mode may be deprecated in the future.

## 1) Environment variables

### Required

```env
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=change-me-long-random
JWT_REFRESH_SECRET=change-me-long-random
ADMIN_USERNAME=change-me
ADMIN_PASSWORD=change-me
CORS_ORIGIN=https://your-frontend.example
```

### Stripe (if using billing)

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_URL=https://your-frontend.example
BILLING_RETURN_URL_RELATIVE=/settings/billing
```

### Encrypted settings (if using encrypted Global Settings)

```env
SAASBACKEND_ENCRYPTION_KEY=change-me-32-bytes-or-more
```

### Email (optional)

```env
RESEND_API_KEY=re_...
EMAIL_FROM="Your App <no-reply@yourdomain.com>"
FRONTEND_URL=https://your-frontend.example
```

## 2) Admin access hardening

- Change `ADMIN_USERNAME` and `ADMIN_PASSWORD` from defaults.
- Ensure admin endpoints are not exposed publicly without auth.

Quick check:

```bash
curl -i http://localhost:5000/admin/test
```

Expected:

- `401` with `WWW-Authenticate: Basic`.

## 3) CORS verification

Verify your frontend origin is allowed:

```bash
curl -i \
  -H "Origin: https://your-frontend.example" \
  http://localhost:5000/health
```

If using middleware mode behind a parent app, decide whether:

- Parent handles CORS (disable SaasBackend CORS), or
- SaasBackend handles CORS.

## 4) Stripe webhook setup

### Choose endpoint

SaasBackend accepts:

- `POST /api/stripe/webhook` (preferred)
- `POST /api/stripe-webhook` (legacy)

If mounted under a prefix (example `/saas`), use:

- `POST /saas/api/stripe/webhook`

### Stripe CLI smoke test (staging)

```bash
stripe login
stripe listen --forward-to https://your-api.example/api/stripe/webhook
stripe trigger checkout.session.completed
```

### Production verification

- Confirm the webhook secret matches the endpoint configuration.
- Confirm your deployment preserves the raw request body for the webhook route.

## 5) Stripe monitoring & retries

Check webhook stats:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  https://your-api.example/api/admin/stripe-webhooks-stats
```

List failed events:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "https://your-api.example/api/admin/stripe-webhooks?status=failed"
```

Retry failed events:

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "maxRetries": 3}' \
  https://your-api.example/api/admin/stripe-webhooks/retry
```

## 6) Email verification

If `RESEND_API_KEY` is not configured (or `resend` is not installed), emails are simulated.

Test password reset flow:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}' \
  https://your-api.example/api/user/password-reset-request
```

Then check logs and `EmailLog` entries.

## 7) Secrets rotation

- Rotate JWT secrets and invalidate old refresh tokens if you implement token persistence.
- Rotate `SAASBACKEND_ENCRYPTION_KEY` only if you can re-encrypt stored encrypted settings.
- Rotate Stripe secrets using Stripe dashboard best practices.

## 8) Minimal runtime health checks

Health endpoint:

```bash
curl -f https://your-api.example/health
```

Admin endpoints should require auth:

```bash
curl -i https://your-api.example/api/admin/users
```

Expected:

- `401` with basic auth challenge.
