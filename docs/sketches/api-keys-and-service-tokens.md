# API Keys + Service Tokens (Sketch)

## Goal
Enable server-to-server access and user-generated API keys so other apps can integrate with this backend without using interactive JWT login.

Typical use cases:
- CLI tools
- Zapier/Make integrations
- Background services posting events

## Non-goals (for v1)
- OAuth 2.0 authorization server
- Fine-grained per-endpoint policy engine

## Core concepts
- **API Key**: long-lived secret created by a user (or org admin).
- **Scopes**: coarse permissions (e.g. `read:users`, `write:webhooks`).
- **Key rotation**: create multiple active keys and revoke old ones.

## Data model (Mongoose)
### `ApiKey`
- `userId` (ObjectId -> User, required, index)
- `orgId` (ObjectId -> Organization, optional, index)
- `name` (string, required)
- `prefix` (string, required, index) (first ~8 chars of raw key)
- `secretHash` (string, required) (hash of full raw key)
- `scopes` (array of strings)
- `status` (`active` | `revoked`)
- `lastUsedAt` (date, optional)
- `expiresAt` (date, optional)
- timestamps

Indexes:
- `{ prefix: 1 }`
- `{ userId: 1, status: 1, createdAt: -1 }`

## Auth mechanism
- Clients send: `Authorization: ApiKey <rawKey>`
- Server extracts `prefix` to find candidate key(s)
- Compare `secretHash`

On success:
- Attach `req.apiKey`
- Attach `req.user` (resolved via `userId`)

## API endpoints (sketch)
All endpoints below require **JWT** unless noted.

### User/org management
- `GET /api/api-keys` - list keys
- `POST /api/api-keys` - create key
  - body: `{ name, scopes, expiresAt? }`
  - response includes raw key exactly once
- `DELETE /api/api-keys/:id` - revoke key

### Admin (Basic Auth)
- `GET /api/admin/api-keys` - list keys (debug/support)

## Middleware
- `authenticateApiKey` middleware (parallel to JWT auth)
- Optional `authenticateAny`:
  - accept JWT OR ApiKey

## Scopes (starter set)
- `read:self`
- `write:self`
- `read:notifications`
- `write:notifications`
- `read:activity`
- `write:activity`

## Rate limiting
API-key auth should integrate with rate limiting:
- key-based quotas
- per-IP fallback

## Activity/audit logging
- `api_key_created`
- `api_key_revoked`
- `api_key_used` (maybe sampled)

## Implementation outline (files)
- `src/models/ApiKey.js`
- `src/middleware/apiKeyAuth.js`
- `src/controllers/apiKey.controller.js`
- `src/routes/apiKey.routes.js`

## Testing checklist
- Create key -> raw key returned once
- Use key on protected endpoint -> succeeds
- Revoke key -> subsequent calls `401`
- Invalid format -> `401`

## Open questions
- Should API keys be org-scoped only?
- Default scopes: empty (deny) or permissive?
- Do we allow keys to create other keys (probably no)?
