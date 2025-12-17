# Production checklist

## What it is
Copy/paste oriented checklist to harden SaasBackend for production. Middleware mode is the recommended integration approach.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/health`
- `/saas/api/admin/users`
- `/saas/api/stripe/webhook`

## Configuration
### Required environment variables
```env
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=change-me-long-random
JWT_REFRESH_SECRET=change-me-long-random
ADMIN_USERNAME=change-me
ADMIN_PASSWORD=change-me
CORS_ORIGIN=https://your-frontend.example
```

### Optional environment variables
```env
STRIPE_SECRET_KEY=sk_live_...
RESEND_API_KEY=re_...
EMAIL_FROM="Your App <no-reply@yourdomain.com>"
FRONTEND_URL=https://your-frontend.example
```

## API
### Public endpoints
- `GET /saas/health` - Health check

### Admin endpoints (Basic Auth)
- `GET /saas/api/admin/stripe-webhooks-stats` - Webhook statistics
- `GET /saas/api/admin/stripe-webhooks` - List webhook events
- `POST /saas/api/admin/stripe-webhooks/retry` - Retry failed events

## Admin UI
- `/saas/admin/test` - Admin access verification
- `/saas/admin/global-settings` - Configuration management

## Common errors / troubleshooting
- **401 Unauthorized**: Admin credentials not configured or incorrect
- **CORS errors**: Frontend origin not in `CORS_ORIGIN`
- **Email simulation**: `RESEND_API_KEY` not configured
