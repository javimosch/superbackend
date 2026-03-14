# Waiting list & forms

## What it is
Public endpoints for email capture (waiting list) and generic form submissions. Designed to be embedded into marketing sites or product UI.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `${BASE_URL}/api/waiting-list/subscribe`
- `${BASE_URL}/api/forms/submit`

## API

### Public endpoints
- `POST ${BASE_URL}/api/waiting-list/subscribe` - Subscribe to waiting list
- `GET ${BASE_URL}/api/waiting-list/stats` - Get waiting list stats
- `POST ${BASE_URL}/api/forms/submit` - Submit form data

## Rate Limiting

The waiting list endpoints are protected by rate limiters to prevent spam and abuse:

### Subscribe Endpoint (`POST /api/waiting-list/subscribe`)
- **Limiter ID**: `waitingListSubscribeLimiter`
- **Default Configuration**:
  - **Enabled**: `true` (enabled by default)
  - **Mode**: `enforce` (blocks violations)
  - **Limit**: 1 request per minute (60,000ms)
  - **Identity**: IP address-based
- **Purpose**: Prevents bot spam and duplicate submissions

### Stats Endpoint (`GET /api/waiting-list/stats`)
- **Limiter ID**: `waitingListStatsLimiter`
- **Default Configuration**:
  - **Enabled**: `true` (enabled by default)
  - **Mode**: `reportOnly` (monitors without blocking)
  - **Limit**: 60 requests per minute
  - **Identity**: IP address-based
- **Purpose**: Monitors usage patterns, prevents scraping

### Managing Rate Limits

1. Navigate to **Admin → Rate Limiter** (`/admin/rate-limiter`)
2. Find `waitingListSubscribeLimiter` or `waitingListStatsLimiter` in the list
3. Click to edit and configure:
   - **Enabled**: Toggle on/off
   - **Mode**: `reportOnly` (monitor) or `enforce` (block violations)
   - **Limit**: Max requests per window
   - **Window**: Time window in milliseconds
   - **Identity**: How to identify users (IP, userId, etc.)
4. Save changes

When a rate limit is exceeded (in enforce mode), the endpoint returns:
- **HTTP 429 Too Many Requests**
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`, `X-RateLimit-Mode`

## Admin UI
- `/saas/admin/waiting-list` - Waiting list management
- `/saas/admin/forms` - Form submissions management
- `/saas/admin/rate-limiter` - Rate limiter configuration

## Common errors / troubleshooting
- **400 Bad Request**: Invalid email format or missing required fields
- **409 Conflict**: Email already exists in waiting list
- **429 Too Many Requests**: Rate limit exceeded (if enabled)
