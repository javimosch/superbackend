# Forms

## What it is

The Forms feature allows you to collect and track form submissions from your frontend.

It is designed for:
- Contact forms
- Support requests
- Lead capture
- Any custom data collection

Submissions are stored in MongoDB and can be searched and managed via the Admin UI.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `${BASE_URL}/api/forms/submit`
- `${BASE_URL}/api/admin/forms`

## API

### Public endpoints

#### Submit a form

```
POST ${BASE_URL}/api/forms/submit
```

Body:

```json
{
  "formKey": "contact",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Hello from the frontend!"
  },
  "metadata": {
    "source": "homepage"
  }
}
```

Example:

```bash
curl -X POST "${BASE_URL}/api/forms/submit" \
  -H "Content-Type: application/json" \
  -d '{"formKey":"contact","data":{"email":"user@example.com","message":"Hi!"}}'
```

### Admin endpoints (Basic Auth)

- `GET ${BASE_URL}/api/admin/forms` - List submissions
- `GET ${BASE_URL}/api/admin/forms?formKey=contact` - Filter by form type

## Admin UI
- `/admin/forms` - Form submissions management

## Common errors / troubleshooting
- **400 Bad Request**: Missing `formKey` or invalid fields.
- **400 Bad Request**: Validation failed (e.g. invalid email format for known form types).
