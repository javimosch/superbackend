# Stripe webhooks

## What it is

This backend consumes Stripe webhook events to keep your local user/subscription state in sync.

This guide focuses on:

- The expected event flow.
- How to test locally.
- How to debug failures and retry processing.

## Prerequisites

- Stripe webhook endpoint is configured in your Stripe dashboard (or via Stripe CLI).
- `STRIPE_WEBHOOK_SECRET` is configured in your environment.
- Stripe API access is configured (see `stripe-pricing-management` doc for `STRIPE_SECRET_KEY`).

## High-level flow

The webhook handler is idempotent: it stores incoming events and avoids processing the same `stripeEventId` twice.

On relevant events, it updates application state (for example the user’s subscription status and plan mapping).

## Subscription lifecycle (typical)

In practice, creating a subscription via Checkout often produces several events.

Common sequence:

1. `checkout.session.completed`
2. `customer.subscription.created` (often starts as `incomplete`)
3. `customer.subscription.updated` (can transition to `active`)
4. `invoice.payment_succeeded`

Your integration should treat this as eventual consistency: the “final” state may arrive a few seconds later.

## Status mapping

Stripe subscription status is normalized into internal status strings.

```js
{
  'active': 'active',
  'past_due': 'past_due',
  'unpaid': 'unpaid',
  'canceled': 'cancelled',
  'incomplete': 'incomplete',
  'incomplete_expired': 'incomplete_expired',
  'trialing': 'trialing'
}
```

## Admin API for webhooks (basic auth)

These endpoints help you inspect webhook ingestion and recover from failures.

### List webhook events

```
GET /api/admin/stripe-webhooks
Query: limit, offset, eventType, status
```

### Fetch a single event

```
GET /api/admin/stripe-webhooks/:id
```

### Retry failed events (batch)

```
POST /api/admin/stripe-webhooks/retry
Body: { limit: 10, maxRetries: 3 }
```

### Retry a single event

```
POST /api/admin/stripe-webhooks/:id/retry
```

### Webhook stats

```
GET /api/admin/stripe-webhooks-stats
```

## Local testing

With Stripe CLI:

```bash
stripe login
stripe listen --forward-to ${BASE_URL}/api/billing/webhook
```

Trigger events:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

## Debugging & recovery

### Check overall health

```bash
curl -u ${ADMIN_USERNAME}:${ADMIN_PASSWORD} http://${BASE_URL}/api/admin/stripe-webhooks-stats
```

### Inspect failed events

```bash
curl -u ${ADMIN_USERNAME}:${ADMIN_PASSWORD} "http://${BASE_URL}/api/admin/stripe-webhooks?status=failed"
```

### Retry failures

```bash
curl -X POST -u ${ADMIN_USERNAME}:${ADMIN_PASSWORD} \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "maxRetries": 3}' \
  http://${BASE_URL}/api/admin/stripe-webhooks/retry
```

### Understand what changed on update events

Update events can include `previousAttributes`, which tells you what changed between the old and new object.
This is useful when you see `customer.subscription.updated` and want to know which fields triggered the update.

## Common failure modes

### User not found

This usually means the webhook references a Stripe customer/subscription that your DB doesn’t know about yet.

Typical causes:

- Checkout session didn’t include the metadata your backend uses to link the user.
- The user was deleted or never existed.
- You are replaying events from a different environment.

### Duplicate events

Stripe retries delivery. Duplicate delivery should be expected.
The handler treats duplicates as success and does not reprocess the event.

## References

- Admin endpoints above (`/api/admin/stripe-webhooks*`)
- `docs/features/webhook-testing-guide.md`
