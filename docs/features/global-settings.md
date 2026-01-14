# Global settings

## What it is

Global settings are key/value records stored in MongoDB that let you configure SuperBackend at runtime.

Use cases:

- Store feature flags and configuration values.
- Store secrets (when using encrypted settings) so you don’t have to rely exclusively on env vars.

## Setting types (conceptual)

The API supports different kinds of settings (for example plain vs encrypted).

### Encrypted settings

Encrypted settings are stored encrypted at rest and decrypted by the backend when needed.

Important:

- To use encrypted settings, you must provide `SUPERBACKEND_ENCRYPTION_KEY` in the environment.
- If the encryption key changes, previously stored encrypted values may become undecryptable.

Example encrypted keys you may store:

- `STRIPE_SECRET_KEY`

## Endpoints

### Public

#### Get public settings

```
GET /api/settings/public
```

This returns only settings marked as public.

### Admin (basic auth)

These are the recommended admin endpoints:

Base path:

```
/api/admin/settings
```

#### List settings

```
GET /api/admin/settings/
```

#### Get one setting

```
GET /api/admin/settings/:key
```

#### Create a setting

```
POST /api/admin/settings/
```

#### Update a setting

```
PUT /api/admin/settings/:key
```

#### Delete a setting

```
DELETE /api/admin/settings/:key
```

## Examples

### Read public settings

```bash
curl "${BASE_URL}/api/settings/public"
```

### Create/update an encrypted setting (admin)

You typically do this through the admin UI, but you can also use the API.

```bash
curl -X PUT -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  -H "Content-Type: application/json" \
  -d '{"type":"encrypted","value":"sk_test_...","public":false}' \
  "${BASE_URL}/api/admin/settings/STRIPE_SECRET_KEY"
```

## Troubleshooting

### Encrypted settings don’t work

Common causes:

- `SUPERBACKEND_ENCRYPTION_KEY` is missing.
- `SUPERBACKEND_ENCRYPTION_KEY` is different from the key that was used to encrypt the stored value.
- The stored value is not valid for its consumer (for example a Stripe key that doesn’t start with `sk_`).
