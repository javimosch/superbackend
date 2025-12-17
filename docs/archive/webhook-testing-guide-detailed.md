# Stripe webhook testing guide

## What it is
Quick reference for testing and monitoring Stripe webhooks in SaasBackend.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/admin/stripe-webhooks-stats`
- `/saas/api/admin/stripe-webhooks`

## Admin API
- `GET /saas/api/admin/stripe-webhooks-stats` - Webhook statistics
- `GET /saas/api/admin/stripe-webhooks` - List webhook events
- `POST /saas/api/admin/stripe-webhooks/retry` - Retry failed events

## Admin UI
- `/saas/admin/stripe-pricing` - Webhook monitoring and retry

## Common errors / troubleshooting
- **High failure rate**: Check `processingErrors` in event details
- **Duplicate events**: System automatically detects and skips duplicates
- **Processing timeouts**: Increase `maxRetries` or check network connectivity
