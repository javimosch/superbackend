# Stripe Webhook Testing Guide

## Quick Start

Use the helper script for common operations:

```bash
# Show statistics
./scripts/webhook-admin.sh stats

# List failed webhooks
./scripts/webhook-admin.sh failed

# Retry all failed webhooks
./scripts/webhook-admin.sh retry-all 10

# Monitor in real-time
./scripts/webhook-admin.sh monitor
```

## Test Scenarios

### Scenario 1: Successful Subscription Creation
**Steps:**
1. Create a checkout session
2. Complete payment in Stripe test mode
3. Verify three events are received:
   - `checkout.session.completed`
   - `customer.subscription.created` (status: incomplete)
   - `customer.subscription.updated` (status: incomplete → active)

**Verification:**
```bash
# Check webhook stats
curl -u admin:password http://localhost:5000/api/admin/stripe-webhooks-stats

# List recent events
curl -u admin:password "http://localhost:5000/api/admin/stripe-webhooks?limit=10" | jq
```

**Expected Result:**
- All 3 events status: `processed`
- User subscription status: `active`
- User has `stripeSubscriptionId`

### Scenario 2: Duplicate Webhook Handling
**Steps:**
1. Send the same webhook twice using Stripe CLI
2. Check that second attempt is marked as duplicate

**Test Command:**
```bash
stripe trigger customer.subscription.created
stripe trigger customer.subscription.created
```

**Expected Result:**
- Only one event stored in database
- Second request returns `{ received: true, status: 'duplicate' }`

### Scenario 3: Failed Webhook Recovery
**Steps:**
1. Manually mark a webhook as failed in MongoDB:
```javascript
db.stripewebhookevents.updateOne(
  { stripeEventId: "evt_xxx" },
  { $set: { status: "failed", processingErrors: [{ message: "Test error", timestamp: new Date() }] } }
)
```

2. Use retry endpoint:
```bash
./scripts/webhook-admin.sh retry evt_xxx
```

**Expected Result:**
- Event status changes to `processed`
- User data updated correctly
- `processedAt` timestamp set

### Scenario 4: Payment Failure
**Steps:**
1. Use Stripe test card that triggers payment failure
2. Verify `invoice.payment_failed` webhook received

**Expected Result:**
- User subscription status: `past_due`
- Event stored with status: `processed`

### Scenario 5: Subscription Cancellation
**Steps:**
1. Cancel subscription through Stripe Dashboard or API
2. Verify `customer.subscription.deleted` webhook

**Expected Result:**
- User subscription status: `cancelled`
- Event stored with status: `processed`

## Manual Testing with Stripe CLI

### Setup
```bash
stripe login
stripe listen --forward-to localhost:5000/api/billing/webhook
```

### Trigger Events
```bash
# Test subscription creation
stripe trigger customer.subscription.created

# Test subscription update
stripe trigger customer.subscription.updated

# Test checkout completion
stripe trigger checkout.session.completed

# Test payment failure
stripe trigger invoice.payment_failed
```

## Monitoring Dashboard Queries

### Count Events by Type
```bash
curl -u admin:password "http://localhost:5000/api/admin/stripe-webhooks-stats" | jq '.eventTypeStats'
```

### Recent Failures
```bash
curl -u admin:password "http://localhost:5000/api/admin/stripe-webhooks-stats" | jq '.recentFailures'
```

### Events from Last Hour
```bash
ONE_HOUR_AGO=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
curl -u admin:password "http://localhost:5000/api/admin/stripe-webhooks?since=$ONE_HOUR_AGO" | jq
```

## Performance Testing

### Bulk Event Processing
1. Generate 100 test events
2. Monitor processing time
3. Check for any failures

```bash
for i in {1..100}; do
  stripe trigger customer.subscription.updated &
done
wait

# Check results
./scripts/webhook-admin.sh stats
```

## Troubleshooting

### Issue: Webhooks not being received
**Check:**
1. Webhook secret configured: `STRIPE_WEBHOOK_SECRET`
2. Webhook endpoint registered in Stripe Dashboard
3. Firewall/network allows Stripe IPs

### Issue: High failure rate
**Check:**
```bash
# View failed events
./scripts/webhook-admin.sh failed | jq '.events[] | {id, type, errors: .processingErrors}'

# Check common error patterns
curl -u admin:password "http://localhost:5000/api/admin/stripe-webhooks?status=failed" | \
  jq '.events[].processingErrors[].message' | sort | uniq -c
```

### Issue: User not found errors
**Check:**
1. Stripe customer IDs match database records
2. User was created before webhook fired
3. Metadata includes userId in checkout session

## Database Queries

### Find Events for Specific Customer
```javascript
db.stripewebhookevents.find({
  "data.customer": "cus_xxx"
}).sort({ receivedAt: -1 })
```

### Find Unprocessed Events Older Than 1 Hour
```javascript
db.stripewebhookevents.find({
  status: "received",
  receivedAt: { $lt: new Date(Date.now() - 3600000) }
})
```

### Event Processing Time Distribution
```javascript
db.stripewebhookevents.aggregate([
  {
    $match: { status: "processed", processedAt: { $exists: true } }
  },
  {
    $project: {
      processingTime: { $subtract: ["$processedAt", "$receivedAt"] }
    }
  },
  {
    $bucket: {
      groupBy: "$processingTime",
      boundaries: [0, 1000, 5000, 10000, 30000],
      default: "30000+",
      output: { count: { $sum: 1 } }
    }
  }
])
```

## Alerting Recommendations

Set up alerts for:
1. **Failed webhook count > 10** in last hour
2. **Unprocessed events > 5** older than 10 minutes
3. **Processing time > 5 seconds** consistently
4. **No webhooks received** in last 24 hours (for active systems)

## Best Practices

1. ✅ Always retry failed webhooks before manual intervention
2. ✅ Check `previous_attributes` to understand what changed
3. ✅ Monitor webhook stats daily
4. ✅ Archive processed webhooks older than 90 days
5. ✅ Keep Stripe API version updated
6. ✅ Test webhook handling in staging before production
7. ✅ Use idempotency keys for API calls triggered by webhooks
