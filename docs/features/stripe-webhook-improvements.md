# Stripe Webhook Improvements

## Overview
This document outlines the improvements made to the Stripe webhook handling system to make it more robust, maintainable, and observable.

## Key Improvements

### 1. **Separated Business Logic into Service Layer**
- Created `src/services/stripe.service.js` to handle all Stripe-related business logic
- Moved subscription and event handling logic out of the controller
- Easier to test and maintain
- Consistent status mapping across all handlers

### 2. **Added `checkout.session.completed` Handler**
- Previously missing but critical for capturing subscription creation
- Now properly handles the completion of checkout sessions
- Links subscriptions to users immediately after successful payment

### 3. **Enhanced Webhook Event Storage**
- Added `previousAttributes` field to track what changed in update events
- Added `retryCount` to track retry attempts
- Improved `processingErrors` structure with timestamps
- Added `skipped` status for events that don't need processing
- Added compound indexes for better query performance

### 4. **Webhook Retry Mechanism**
- Created `src/utils/webhookRetry.js` with automatic retry capability
- Configurable maximum retry attempts (default: 3)
- Batch retry of failed webhooks
- Single webhook retry capability
- Detailed error tracking with timestamps

### 5. **Admin Endpoints for Webhook Management**

#### View Webhooks
```
GET /api/admin/stripe-webhooks
Query params: limit, offset, eventType, status
```

#### Get Single Webhook
```
GET /api/admin/stripe-webhooks/:id
```

#### Retry Failed Webhooks
```
POST /api/admin/stripe-webhooks/retry
Body: { limit: 10, maxRetries: 3 }
```

#### Retry Single Webhook
```
POST /api/admin/stripe-webhooks/:id/retry
```

#### Get Webhook Statistics
```
GET /api/admin/stripe-webhooks-stats
```

### 6. **Better Error Handling**
- Detailed error messages with timestamps
- Failed events don't block webhook response
- Graceful degradation when users not found
- Console logging for debugging

### 7. **Idempotency**
- Duplicate webhook detection using `stripeEventId`
- Returns success for duplicate events instead of errors
- Prevents processing the same event multiple times

## Event Flow

### Subscription Creation Flow
1. `checkout.session.completed` - Captures initial subscription link
2. `customer.subscription.created` - Sets initial status (often 'incomplete')
3. `customer.subscription.updated` - Updates to 'active' after payment
4. `invoice.payment_succeeded` - Confirms payment and activation

### Status Mapping
```javascript
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

## Monitoring and Debugging

### Check Webhook Health
```bash
curl -u admin:password http://localhost:5000/api/admin/stripe-webhooks-stats
```

### View Failed Webhooks
```bash
curl -u admin:password "http://localhost:5000/api/admin/stripe-webhooks?status=failed"
```

### Retry Failed Webhooks
```bash
curl -X POST -u admin:password \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "maxRetries": 3}' \
  http://localhost:5000/api/admin/stripe-webhooks/retry
```

### View Specific Event
```bash
curl -u admin:password http://localhost:5000/api/admin/stripe-webhooks/evt_xxx
```

## Best Practices

1. **Monitor webhook stats regularly** - Use the stats endpoint to track failures
2. **Set up alerts** - Monitor failed webhook count and alert if > threshold
3. **Review previous_attributes** - When debugging, check what changed in update events
4. **Use retry mechanism** - Don't manually fix data; retry webhooks first
5. **Check logs** - Service logs contain detailed event processing info

## Database Indexes

The following indexes were added for performance:
- `stripeEventId` (unique)
- `eventType` 
- `status`
- `receivedAt`
- Compound: `(status, receivedAt)`
- Compound: `(eventType, createdAt)`

## Testing

Test the webhook improvements:

1. Create a test subscription in Stripe
2. Observe events being stored with all metadata
3. Artificially mark an event as failed
4. Use retry endpoint to reprocess
5. Check stats to verify processing

## Future Enhancements

Consider adding:
- Dead letter queue for permanently failed events
- Webhook event archival after X days
- Real-time webhook status dashboard
- Webhook replay functionality
- Event sourcing pattern for subscription state
- Webhook signature verification logging
- Rate limiting and throttling
