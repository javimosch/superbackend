# Audit Log + Admin Actions (Sketch)

## Goal
Add a robust audit log system for compliance and support:
- Track admin operations (Basic Auth)
- Track sensitive user actions
- Provide searchable history

This complements the existing activity log by focusing on **security-relevant** events.

## Non-goals (for v1)
- Full SIEM integration
- Tamper-proof append-only storage (but we should avoid edits)

## Core concepts
- **Audit entry**: immutable record of a critical action.
- **Actor**: user, admin basic auth, or API key.
- **Target**: resource being modified.

## Data model (Mongoose)
### `AuditLog`
- `timestamp` (date, required, index)
- `actorType` (`user` | `admin_basic` | `api_key`)
- `actorId` (ObjectId, optional)
- `actorLabel` (string, optional) (e.g. admin username)
- `ipAddress` (string)
- `userAgent` (string)
- `action` (string, required, index)
- `category` (`auth` | `billing` | `admin` | `security` | `other`)
- `targetType` (string, optional) (e.g. `User`, `Organization`)
- `targetId` (ObjectId, optional)
- `metadata` (Mixed, optional)

Indexes:
- `{ action: 1, timestamp: -1 }`
- `{ targetType: 1, targetId: 1, timestamp: -1 }`

## What to log (starter)
Admin:
- user subscription updates
- generating test JWT
- global setting changes
- plan/feature flag changes

User:
- password change
- password reset confirm
- account deletion
- email change

API key:
- api key created/revoked

## API endpoints (sketch)
### Admin (Basic Auth)
- `GET /api/admin/audit-log?limit=50&offset=0&action=...&targetId=...`
- `GET /api/admin/audit-log/:id`

### User (JWT) (optional)
- `GET /api/audit-log` (only user’s own security events)

## Implementation pattern
Create a centralized helper:
- `auditLogService.record({ actorType, actorId, action, category, targetType, targetId, metadata, req })`

Call it from:
- controllers for sensitive endpoints
- middleware for auth events

## Activity log vs audit log
- Activity log: product UX (“user did X”)
- Audit log: compliance/security (“admin changed subscription”)

## Implementation outline (files)
- `src/models/AuditLog.js`
- `src/services/auditLog.service.js`
- `src/controllers/adminAuditLog.controller.js`
- `src/routes/adminAuditLog.routes.js`

## Testing checklist
- Admin actions appear with `actorType=admin_basic`
- User actions include `ipAddress` and `userAgent`
- Pagination works

## Open questions
- Should audit logs be write-only (no deletes) even for admin?
- Do we need retention policies (e.g. 90 days)?
- Should audit logs be tenant-scoped by org?
