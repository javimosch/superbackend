# Waiting list & forms

## What it is

SaasBackend provides simple public endpoints for:

- Waiting list subscription (email capture)
- Generic form submissions (for example contact forms)

These endpoints are meant to be embedded into your marketing site or product UI.

## Waiting list

### Subscribe

```
POST /api/waiting-list/subscribe
```

Body:

```json
{ "email": "user@example.com", "type": "early_access", "referralSource": "website" }
```

Notes:

- The response does not echo back the email (privacy).
- Submitting the same email twice returns a conflict.

### Stats

```
GET /api/waiting-list/stats
```

Public endpoint to query aggregated stats.

## Forms

### Submit

```
POST /api/forms/submit
```

Body:

```json
{ "formKey": "contact", "fields": { "email": "user@example.com", "message": "Hello" } }
```

Notes:

- Supports anonymous submissions with an anon cookie (`enbauges_anon_id`).
- If the request includes a valid Bearer token, the submission is attributed to that user.

## Troubleshooting

### 400 validation errors

- Waiting list requires a valid `email` and a non-empty `type`.
- `contact` form requires a valid `fields.email` and a minimum message length.
