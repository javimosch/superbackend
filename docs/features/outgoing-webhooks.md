# Outgoing Webhooks

The Outgoing Webhooks feature allows the system to deliver real-time events to external systems via HTTP POST requests. This enables integration with tools like Zapier, Make.com, or custom backends.

## Core Components

### 1. Webhook Model (`src/models/Webhook.js`)
- **name**: Optional custom name (auto-generated if empty).
- **targetUrl**: The destination URL for the payload.
- **secret**: Auto-generated signing secret for verification.
- **events**: Array of subscribed events (e.g., `form.submitted`, `user.login`).
- **organizationId**: Optional. If null, the webhook is system-wide (SuperAdmin only).
- **status**: `active`, `paused`, or `failed`.

### 2. Webhook Service (`src/services/webhook.service.js`)
- **emit(event, data, organizationId)**: Dispatches events to all matching active webhooks.
- **deliver(webhook, payload)**: Performs the actual HTTP POST with a HMAC-SHA256 signature.
- **Verification**: Payloads are signed using the webhook's secret and sent in the `X-SaaS-Signature` header.

### 3. Audit Integration
Every webhook delivery (success or failure) is logged in the `AuditEvent` collection:
- `WEBHOOK_DELIVERY_SUCCESS`
- `WEBHOOK_DELIVERY_FAILURE`

## Supported Events
- `user.login`: Triggered on successful user authentication.
- `user.registered`: Triggered when a new user signs up.
- `organization.updated`: Triggered when organization settings change.
- `member.added`: Triggered when a user joins an organization.
- `form.submitted`: Triggered on new lead/form submissions.
- `audit.event`: Triggered for every system audit log entry.

## Security
- **HMAC Signatures**: Recipient should verify the `X-SaaS-Signature` header using their webhook secret.
- **Timeouts**: Deliveries have a 5-second timeout to prevent blocking.
- **Retries**: (Planned) Intelligent retry logic for transient failures.
- **Rate Limiting**: Webhook test endpoints are rate-limited to prevent abuse:
  - **Limit**: 10 test requests per minute per user/IP
  - **Configuration**: Manageable via Admin UI at `/admin/rate-limiter`
  - **Behavior**: Returns 429 status when limit exceeded
  - **Headers**: Rate limit information included in response headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)

## Administration UI
Located at `/saas/admin/webhooks`, providing:
- **CRUD Operations**: Manage webhook configurations and subscriptions.
- **Testing**: Trigger a test payload to verify endpoint connectivity.
- **History Viewer**: Slide-over panel showing the last 50 delivery attempts with status codes and full payloads.
