# Outbound Webhooks + Event Subscriptions (Sketch)

## Goal
Provide a reusable webhook delivery system so integrators can subscribe to events emitted by this backend.

Examples:
- `user.created`
- `billing.subscription.updated`
- `notification.created`

## Non-goals (for v1)
- Exactly-once delivery (aim for at-least-once)
- Complex transformation DSL

## Core concepts
- **Event**: canonical record of something that happened.
- **Subscription**: destination URL + enabled event types.
- **Delivery attempt**: each try with response status/body.

## Data model (Mongoose)
### `Event`
- `type` (string, required, index)
- `userId` (ObjectId -> User, optional, index)
- `orgId` (ObjectId -> Organization, optional, index)
- `payload` (Mixed, required)
- `createdAt`

### `WebhookSubscription`
- `userId` (ObjectId -> User, required, index)
- `orgId` (ObjectId -> Organization, optional, index)
- `url` (string, required)
- `secret` (string, required) (used to sign)
- `eventTypes` (array of strings) (empty means all)
- `status` (`active` | `paused` | `disabled`)
- `createdAt`

### `WebhookDelivery`
- `eventId` (ObjectId -> Event, required, index)
- `subscriptionId` (ObjectId -> WebhookSubscription, required, index)
- `attempt` (number, required)
- `status` (`pending` | `success` | `failed`)
- `httpStatus` (number, optional)
- `responseBodySnippet` (string, optional)
- `error` (string, optional)
- `nextRetryAt` (date, optional)
- timestamps

Indexes:
- `{ status: 1, nextRetryAt: 1 }`

## Delivery protocol
- POST JSON to subscriber URL
- Headers:
  - `X-Event-Type: <type>`
  - `X-Event-Id: <id>`
  - `X-Signature: <hmac>`

Signature:
- `hmac_sha256(secret, rawBody)`

## API endpoints (sketch)
All endpoints below require **JWT**.

### Subscriptions
- `GET /api/webhook-subscriptions`
- `POST /api/webhook-subscriptions`
- `PUT /api/webhook-subscriptions/:id`
- `DELETE /api/webhook-subscriptions/:id`

### Deliveries (debug)
- `GET /api/webhook-deliveries?status=failed`
- `POST /api/webhook-deliveries/:id/retry`

### Admin (Basic Auth)
- `GET /api/admin/events`
- `GET /api/admin/webhook-deliveries`

## Emitting events
Add a small `event.service.js`:
- `emitEvent({ type, userId, orgId, payload })`
- Creates `Event`
- Enqueues deliveries for matching subscriptions

## Background processing
Works best with a job queue (see `job-queue-and-background-workers.md`).
Fallback (dev): inline attempt.

Retry policy (starter)
- 1m, 5m, 30m, 2h, 12h, 24h (max 6 attempts)

## Activity logging
- `webhook_subscription_created`
- `webhook_delivery_failed` (maybe sampled)

## Implementation outline (files)
- `src/models/Event.js`
- `src/models/WebhookSubscription.js`
- `src/models/WebhookDelivery.js`
- `src/services/event.service.js`
- `src/services/webhookDelivery.service.js`
- `src/controllers/webhookSubscription.controller.js`
- `src/routes/webhookSubscription.routes.js`

## Testing checklist
- Create subscription
- Emit event -> delivery created
- Subscriber returns non-2xx -> delivery marked failed and scheduled retry
- Retry endpoint triggers attempt

## Open questions
- Do we allow per-subscription secret rotation?
- Should event payload include minimal user/org fields or full objects?
- Should we expose an “events catalog” endpoint?
