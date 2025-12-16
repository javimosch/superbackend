# Feature Flags (Sketch)

## Goal
Provide a feature flag system to enable:
- Safe incremental rollout
- Per-user / per-org enablement
- A/B testing groundwork

This accelerates development by allowing hidden features without branching deployments.

## Non-goals (for v1)
- Full experimentation platform
- Statistical analysis

## Core concepts
- **Flag**: named toggle with default behavior.
- **Targeting**: enable for specific users/orgs or percentage rollout.
- **Evaluation**: server-side evaluation to avoid client tampering.

## Data model (Mongoose)
### `FeatureFlag`
- `key` (string, unique, required)
- `description` (string, optional)
- `enabled` (boolean, default false) (global default)
- `rolloutPercentage` (number 0-100, default 0)
- `allowListUserIds` (array of ObjectId -> User)
- `allowListOrgIds` (array of ObjectId -> Organization)
- `denyListUserIds` (array of ObjectId -> User)
- `denyListOrgIds` (array of ObjectId -> Organization)
- `payload` (Mixed, optional) (variant/config)
- timestamps

Indexes:
- `{ key: 1 }` unique

## Evaluation rules (priority)
- If user/org in deny list -> disabled
- If user/org in allow list -> enabled
- Else if `enabled=true` -> enabled
- Else if percentage > 0:
  - hash(userId or orgId) into 0..99
  - enable if bucket < percentage
- Else disabled

## API endpoints (sketch)
### User (JWT)
- `GET /api/feature-flags`
  - returns evaluated flags for the current user (and active org)

### Admin (Basic Auth)
- `GET /api/admin/feature-flags`
- `POST /api/admin/feature-flags`
- `PUT /api/admin/feature-flags/:key`
- `DELETE /api/admin/feature-flags/:key`

## Caching
- Cache flag definitions for short TTL (similar to global settings)
- Ensure admin updates invalidate cache

## Activity logging
- `feature_flag_updated` (admin)

## Implementation outline (files)
- `src/models/FeatureFlag.js`
- `src/services/featureFlag.service.js` (fetch + evaluate)
- `src/controllers/featureFlag.controller.js`
- `src/controllers/adminFeatureFlag.controller.js`
- `src/routes/featureFlag.routes.js`

## Testing checklist
- Allow/deny lists override
- Percentage rollout stable per user
- Admin CRUD works

## Open questions
- Store flags in DB vs integrate with existing global settings system?
- Do we support multi-variant flags (A/B) in v1?
- Do we expose flag payload to client or evaluate server-only?
