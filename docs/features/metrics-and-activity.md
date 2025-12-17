# Metrics & activity

## What it is
Lightweight metrics/event tracking and per-user activity logging for product analytics and auditing.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/metrics/track`
- `/saas/api/activity-log`

## API

### Public endpoints
- `POST /saas/api/metrics/track` - Track event (supports anonymous via anon cookie)
- `GET /saas/api/metrics/impact` - Get aggregate metrics for current month

### JWT endpoints
- `GET /saas/api/activity-log` - List user activity
- `POST /saas/api/activity-log` - Create activity entry

## Admin UI
- `/saas/admin/metrics` - Metrics dashboard and management

## Common errors / troubleshooting
- **Events not attributed to users**: Ensure valid `Authorization: Bearer` header or pass `x-anon-id`
