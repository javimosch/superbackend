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

## Admin UI
- `/saas/admin/waiting-list` - Waiting list management
- `/saas/admin/forms` - Form submissions management

## Common errors / troubleshooting
- **400 Bad Request**: Invalid email format or missing required fields
- **409 Conflict**: Email already exists in waiting list
