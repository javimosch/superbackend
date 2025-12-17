# Forms

## What it is
Form submission system with anonymous and user tracking. Supports custom form types (contact, waiting list, etc.) with admin management and spam protection.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/forms/submit`
- `/saas/api/admin/forms`

## API

### Public endpoints
- `POST /saas/api/forms/submit` - Submit form data

### Admin endpoints (Basic Auth)
- `GET /saas/api/admin/forms` - List submissions
- `GET /saas/api/admin/forms?formKey=contact` - Filter by form type

## Admin UI
- `/saas/admin/forms` - Form submissions management

## Common errors / troubleshooting
- **400 Bad Request**: Missing formKey or invalid fields
- **400 Bad Request**: Contact form validation (invalid email or message too short)
- **500 Internal Server Error**: Database connection issues
