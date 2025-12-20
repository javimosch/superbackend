# Email system

## What it is

SaasBackend includes an email service used for user-facing lifecycle emails such as:

- Password reset
- Password changed confirmation
- Account deletion confirmation

The current provider integration is Resend, with a safe simulation fallback for development.

## Configuration

### Provider key

Resend API key can come from:

- Global setting: `RESEND_API_KEY`
- Environment variable: `RESEND_API_KEY`

If Resend is not configured (or the `resend` package is not installed), the backend will **simulate sending** and log the email.

### From address

- Global setting: `EMAIL_FROM`
- Environment variable: `EMAIL_FROM`

### Frontend URL

Password reset links use:

- Global setting: `FRONTEND_URL`
- Environment variable: `FRONTEND_URL`

## Password reset flow

1. Client calls:

```
POST ${BASE_URL}/api/user/password-reset-request
```

Body:

```json
{ "email": "user@example.com" }
```

2. Backend generates a token, stores a hash + expiry, and sends email.
3. Frontend receives token in URL and calls:

```
POST ${BASE_URL}/api/user/password-reset-confirm
```

Body:

```json
{ "token": "<token-from-email>", "newPassword": "..." }
```

## Templates

Password reset HTML can be customized with a global setting:

- `EMAIL_PASSWORD_RESET_HTML`

Variables:

- `{{resetUrl}}`

Subject can be customized via:

- `EMAIL_PASSWORD_RESET_SUBJECT`

## Troubleshooting

### Emails are not delivered

- If you see simulated email logs, configure `RESEND_API_KEY` and install `resend`.
- Check `EmailLog` records to confirm attempts.
