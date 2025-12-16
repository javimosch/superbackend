# Auth & JWT

## What it is

SaasBackend provides a simple JWT-based auth system for user-facing APIs.

- Public endpoints issue tokens (`/api/auth/*`).
- Protected endpoints require `Authorization: Bearer <access_token>`.

## Tokens

The backend issues:

- `token`: access token (JWT)
- `refreshToken`: refresh token (JWT)

Use the access token for API calls, and refresh when it expires.

## Endpoints

### Register

```
POST /api/auth/register
```

Body:

```json
{ "email": "user@example.com", "password": "password123" }
```

Response includes `token`, `refreshToken`, and `user`.

### Login

```
POST /api/auth/login
```

Body:

```json
{ "email": "user@example.com", "password": "password123" }
```

### Refresh token

```
POST /api/auth/refresh-token
```

Body:

```json
{ "refreshToken": "..." }
```

### Current user

```
GET /api/auth/me
Authorization: Bearer <token>
```

## Common integration flow

1. `POST /api/auth/register` or `POST /api/auth/login`
2. Store `token` (and `refreshToken`) in your app
3. Use `Authorization: Bearer <token>` for protected calls
4. When receiving `401` due to expiration, refresh and retry

## Troubleshooting

### Getting `401 No token provided`

- Ensure you are sending `Authorization: Bearer <token>`.

### Refresh token fails

- Ensure you are using the `refreshToken` returned by login/register.
- Ensure your JWT secrets are configured.
