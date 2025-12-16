# Usage Metering + Entitlements (Sketch)

## Goal
Introduce a reusable entitlement and usage metering system that works with Stripe subscriptions.

Use cases:
- Limit number of projects/items
- Limit API calls per month
- Control access to premium features

This turns billing status into actionable product limits.

## Non-goals (for v1)
- Complex proration handling
- Real-time billing usage reporting to Stripe (can be added later)

## Core concepts
- **Plan**: maps to Stripe price (or internal tier)
- **Entitlement**: allowed limits/features for plan
- **Usage**: counters aggregated per period

## Data model (Mongoose)
### `Plan`
- `key` (string, unique, required) (e.g. `free`, `pro`)
- `stripePriceId` (string, optional, unique)
- `name` (string)
- `entitlements` (object)
  - `maxProjects` (number)
  - `maxSeats` (number)
  - `maxStorageBytes` (number)
  - `features` (object of booleans)
- `status` (`active` | `disabled`)
- timestamps

### `UsageCounter`
- `userId` (ObjectId -> User, required, index)
- `orgId` (ObjectId -> Organization, optional, index)
- `period` (string, required, index) (e.g. `2025-12`)
- `key` (string, required, index) (e.g. `api_calls`, `storage_bytes`)
- `count` (number, required)
- timestamps

Indexes:
- `{ userId: 1, period: 1, key: 1 }` unique

## Plan resolution
- Based on `User.subscriptionStatus` + `stripePriceId` (if available)
- Default to `free`

## Enforcement patterns
- Middleware `requireEntitlement({ featureKey })`
- Helper `assertWithinLimit({ key, limit, current })`

Examples:
- file upload checks `maxStorageBytes`
- org invites check `maxSeats`

## Metering patterns
- Increment counters on key actions
  - API calls
  - file storage bytes
  - events emitted

Aggregation options:
- Inline increments (simple)
- Async aggregation (preferred for high volume)

## API endpoints (sketch)
### User (JWT)
- `GET /api/entitlements` - evaluated entitlements for current user/org
- `GET /api/usage?period=2025-12` - usage counters

### Admin (Basic Auth)
- `GET /api/admin/plans`
- `POST /api/admin/plans`
- `PUT /api/admin/plans/:key`
- `GET /api/admin/usage` (debug)

## Activity logging
- `plan_updated` (admin)
- `limit_exceeded` (user action blocked)

## Implementation outline (files)
- `src/models/Plan.js`
- `src/models/UsageCounter.js`
- `src/services/entitlement.service.js`
- `src/middleware/entitlements.js`
- `src/controllers/entitlements.controller.js`
- `src/routes/entitlements.routes.js`

## Testing checklist
- Free plan defaults
- Upgrading subscription changes plan resolution
- Limit exceeded returns `402` or `403` (decide convention)

## Open questions
- Should we store plan key on User for caching?
- Should `subscriptionStatus=past_due` downgrade entitlements?
- Should usage counters reset based on subscription cycle or calendar month?
