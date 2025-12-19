# JSON configs

Serve small JSON payloads by slug (feature flags, remote settings, app config). Admins manage configs via Basic Auth; clients fetch configs via a public endpoint.

## Base URL / mount prefix

If mounted under a prefix (recommended), all routes below are prefixed.

Example: mounted at `/saas` => `GET /saas/api/json-configs/:slug`

## Data model (stored)

- `title` (string)
- `slug` (string, unique, generated from title + random suffix)
- `alias` (string, optional, unique, custom slug)
- `publicEnabled` (boolean)
- `cacheTtlSeconds` (number; `0` disables in-memory caching)
- `jsonRaw` (string containing JSON)
- `jsonHash` (sha256 of `jsonRaw`)

## Public API (no auth)

### Get config by slug or alias

- `GET /api/json-configs/:slug`

Returns the JSON payload (parsed from `jsonRaw`). If not found or `publicEnabled !== true`, returns `404`.

The `:slug` parameter can be either the auto-generated slug or a custom alias if one is set. Both URLs will be available when an alias is configured.

Optional query:

- `raw=true|1` returns metadata + payload:
  - `{ slug, alias, title, publicEnabled, cacheTtlSeconds, updatedAt, data }`

Examples:

```bash
curl -sS "${BASE_URL}/api/json-configs/app-config-1a2b" | jq
```

```bash
curl -sS "${BASE_URL}/api/json-configs/app-config-1a2b?raw=true" | jq
```

```bash
# If alias "my-app-config" is set, both URLs work:
curl -sS "${BASE_URL}/api/json-configs/my-app-config" | jq
```

## Admin API (Basic Auth)

All admin endpoints require HTTP Basic Auth.

### List

- `GET /api/admin/json-configs`

### Get by id

- `GET /api/admin/json-configs/:id`

### Create

- `POST /api/admin/json-configs`

Body:

- `title` (required)
- `jsonRaw` (required; must be valid JSON string)
- `publicEnabled` (optional; default `false`)
- `cacheTtlSeconds` (optional; default `0`)
- `alias` (optional; custom slug, must be unique across all slugs and aliases)

Example:

```bash
curl -sS -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  -H 'Content-Type: application/json' \
  -d '{"title":"App config","jsonRaw":"{\"theme\":\"dark\"}","publicEnabled":true,"cacheTtlSeconds":60,"alias":"my-app-config"}' \
  "${BASE_URL}/api/admin/json-configs" | jq
```

### Update

- `PUT /api/admin/json-configs/:id`

Patch body supports any of:

- `title`
- `jsonRaw` (must be valid JSON string)
- `publicEnabled`
- `cacheTtlSeconds`
- `alias` (custom slug, must be unique across all slugs and aliases)

### Regenerate slug

- `POST /api/admin/json-configs/:id/regenerate-slug`

### Clear in-memory cache for a slug

- `POST /api/admin/json-configs/:id/clear-cache`

### Delete

- `DELETE /api/admin/json-configs/:id`

## Caching semantics

- Public reads use an in-memory cache keyed by `slug` and `alias`.
- `cacheTtlSeconds` controls TTL:
  - `0` => no caching
  - `> 0` => cache payload for that many seconds
- Admin create/update/regenerate/delete clears cache for the affected slug(s) and alias(es).
- `POST /api/admin/json-configs/:id/clear-cache` clears cache for the config's current `slug` and `alias`.

## Typical frontend usage

```js
// Example: fetch JSON config at runtime
export async function getJsonConfig(baseUrl, slug) {
  const res = await fetch(`${baseUrl}/api/json-configs/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`Failed to load config: ${res.status}`);
  return await res.json();
}
```

## Alias Feature

### Overview
The alias feature allows users to set custom slugs for their JSON configs with uniqueness validation. When an alias is specified, two public URLs become available - one with the auto-generated slug and one with the custom alias.

### Alias Validation
- Aliases are normalized to lowercase, special characters are removed, and spaces are replaced with hyphens
- Aliases must be unique across all existing slugs and aliases
- Validation excludes the current document ID during updates

### Usage Examples

#### Create with Alias
```bash
curl -sS -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  -H 'Content-Type: application/json' \
  -d '{"title":"App config","jsonRaw":"{\"theme\":\"dark\"}","publicEnabled":true,"alias":"my-app-config"}' \
  "${BASE_URL}/api/admin/json-configs"
```

#### Access via Alias
```bash
# Both URLs work when alias is set
curl -sS "${BASE_URL}/api/json-configs/app-config-1a2b" | jq
curl -sS "${BASE_URL}/api/json-configs/my-app-config" | jq
```

#### Update Alias
```bash
curl -sS -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  -X PUT -H 'Content-Type: application/json' \
  -d '{"alias":"new-alias"}' \
  "${BASE_URL}/api/admin/json-configs/:id"
```

### Error Handling
- `ALIAS_NOT_UNIQUE` error code for validation failures
- `VALIDATION` error code for invalid alias format
- Proper error messages for uniqueness conflicts

### Migration Notes
- Existing configs without aliases continue to work unchanged
- Alias field is optional and defaults to null
- Database migration handled automatically by Mongoose schema
- No breaking changes to existing API endpoints
