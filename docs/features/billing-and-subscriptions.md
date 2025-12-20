# Billing & subscriptions

## What it is

SaasBackend integrates with Stripe to:

- Create Checkout sessions for subscriptions or one-time payments
- Redirect users to the Billing Portal
- Reconcile subscription state
- Process Stripe webhooks to update local user state

This doc explains the request/response flow for a typical subscription.

## Prerequisites

- `STRIPE_SECRET_KEY` configured (env var or encrypted global setting)
- `STRIPE_WEBHOOK_SECRET` configured (env var)
- `PUBLIC_URL` configured for redirect URLs

## JWT requirement

Billing endpoints require a logged-in user.

```
Authorization: Bearer <access_token>
```

## Endpoints

### Create Checkout session

```
POST /api/billing/create-checkout-session
```

Body:

```json
{ "priceId": "price_...", "billingMode": "subscription" }
```

Notes:

- `billingMode` can be `subscription` (default) or `payment`.
- The backend sets `metadata.userId` on the session to link events back to the user.

### Create Billing Portal session

```
POST /api/billing/create-portal-session
```

Returns a URL that you should redirect the user to.

### Reconcile subscription

```
POST /api/billing/reconcile-subscription
```

Useful if you want to "pull" state after a redirect back from Stripe.

## Webhook endpoint

Stripe should be configured to POST to:

```
POST /api/stripe/webhook
```

The webhook handler processes events such as:

- `checkout.session.completed`
- `customer.subscription.created/updated/deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Plan mapping

How Stripe prices map to your app's plan label is documented in:

- `docs/features/stripe-pricing-management.md`

## Advanced webhook handling

### Webhook retry scenarios

**1. Network timeout during webhook processing:**
```bash
# Check webhook delivery status
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "${BASE_URL}/api/admin/stripe-webhooks?status=failed"
```

**2. Retry failed webhooks:**
```bash
# Retry all failed webhooks
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "maxRetries": 3}' \
  "${BASE_URL}/api/admin/stripe-webhooks/retry"
```

**3. Retry specific webhook:**
```bash
# Retry specific webhook by ID
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "${BASE_URL}/api/admin/stripe-webhooks/WEBHOOK_ID/retry"
```

### Webhook error handling

**Common webhook errors and solutions:**

**Error: "Customer not found"**
```json
{
  "error": "Customer not found",
  "code": "CUSTOMER_NOT_FOUND",
  "stripeEventId": "evt_1ABC123..."
}
```
**Solution:** Ensure the user has a valid Stripe customer ID in the database.

**Error: "User not found"**
```json
{
  "error": "User not found",
  "code": "USER_NOT_FOUND",
  "stripeEventId": "evt_1ABC123..."
}
```
**Solution:** Check that `metadata.userId` exists in the Stripe event and corresponds to a valid user.

**Error: "Invalid webhook signature"**
```json
{
  "error": "Invalid webhook signature",
  "code": "INVALID_SIGNATURE"
}
```
**Solution:** Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint configuration in Stripe Dashboard.

**Error: "Subscription reconciliation failed"**
```json
{
  "error": "Subscription reconciliation failed",
  "code": "RECONCILIATION_FAILED",
  "details": "Subscription status: incomplete_expired"
}
```
**Solution:** Check subscription status in Stripe Dashboard and handle edge cases.

### Webhook monitoring

**1. Get webhook statistics:**
```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "${BASE_URL}/api/admin/stripe-webhooks-stats"
```

**Response:**
```json
{
  "totalEvents": 150,
  "processedEvents": 145,
  "failedEvents": 5,
  "eventTypeStats": {
    "checkout.session.completed": {
      "total": 50,
      "processed": 50,
      "failed": 0
    },
    "customer.subscription.created": {
      "total": 30,
      "processed": 28,
      "failed": 2
    }
  },
  "recentFailures": [
    {
      "stripeEventId": "evt_1ABC123...",
      "type": "customer.subscription.updated",
      "error": "User not found",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**2. List failed webhooks:**
```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "${BASE_URL}/api/admin/stripe-webhooks?status=failed&limit=10"
```

**3. Check specific webhook details:**
```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "${BASE_URL}/api/admin/stripe-webhooks/WEBHOOK_ID"
```

### Error response examples

**Checkout session creation error:**
```json
{
  "error": "Price not found",
  "code": "PRICE_NOT_FOUND",
  "priceId": "price_invalid"
}
```

**Billing portal error:**
```json
{
  "error": "Customer not found",
  "code": "CUSTOMER_NOT_FOUND",
  "userId": "60f7b3b3b3b3b3b3b3b3b3b3"
}
```

**Reconciliation error:**
```json
{
  "error": "No active subscription found",
  "code": "NO_SUBSCRIPTION",
  "userId": "60f7b3b3b3b3b3b3b3b3b3b3"
}
```

### Webhook security best practices

**1. Verify webhook signatures:**
```javascript
// Example webhook signature verification
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/stripe/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Process event
  res.json({ received: true });
});
```

**2. Handle idempotency:**
```javascript
// Webhook events are idempotent - handle duplicates gracefully
if (existingWebhook.status === 'processed') {
  return res.json({ received: true, status: 'duplicate' });
}
```

**3. Rate limiting:**
```javascript
// Implement rate limiting for webhook endpoints
const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many webhook requests'
});

app.post('/api/stripe/webhook', webhookLimiter, (req, res) => {
  // Webhook processing logic
});
```

## Troubleshooting

### Checkout session created but plan doesn't update

- Webhooks are asynchronous: allow a few seconds.
- Ensure `STRIPE_WEBHOOK_SECRET` matches the endpoint configuration.
- Check webhook ingestion and failures via:
  - `docs/features/stripe-webhook-improvements.md`
  - `docs/features/webhook-testing-guide.md`

### Common issues and solutions

**Issue: "Price not found"**
- **Cause:** Invalid or missing `priceId`
- **Solution:** Verify the price exists in Stripe and is correctly passed

**Issue: "Customer not found"**
- **Cause:** User doesn't have a Stripe customer record
- **Solution:** Ensure customer creation happens before checkout

**Issue: "Webhook not received"**
- **Cause:** Network issues or incorrect webhook URL
- **Solution:** Check Stripe Dashboard webhook logs and verify URL

**Issue: "Subscription status not updated"**
- **Cause:** Webhook processing failed or was delayed
- **Solution:** Use reconciliation endpoint or check webhook stats

**Issue: "Duplicate subscription created"**
- **Cause:** Multiple webhook deliveries or race conditions
- **Solution:** Check for existing subscriptions before creating new ones

### Debugging workflow

**1. Check webhook delivery:**
```bash
# In Stripe Dashboard, check webhook logs
# Or use the API to check delivery status
```

**2. Verify user state:**
```bash
# Check user's subscription status
curl -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/auth/me"
```

**3. Manual reconciliation:**
```bash
# Force subscription reconciliation
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "${BASE_URL}/api/billing/reconcile-subscription"
```

**4. Check webhook processing:**
```bash
# View webhook processing logs
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "${BASE_URL}/api/admin/stripe-webhooks?status=failed"
```
