# Organizations (Teams) + RBAC (Sketch)

## Goal
Add first-class multi-tenancy beyond single-user accounts:
- Organizations (aka workspaces/teams)
- Membership management
- Role-based access control (RBAC)

This should make it easy to build B2B SaaS apps where users collaborate in a shared workspace.

## Non-goals (for v1)
- Fine-grained ABAC/policy engine
- SCIM / SSO
- Complex billing-per-seat enforcement (tracked separately in usage/entitlements)

## Core concepts
- **Organization**: top-level workspace entity.
- **Membership**: link between a `User` and an `Organization`.
- **Role**: determines permissions within an org.
- **Org context**: most endpoints operate within a selected `orgId`.

## Data model (Mongoose)
### `Organization`
- `name` (string, required)
- `slug` (string, unique, required)
- `ownerUserId` (ObjectId -> User, required)
- `billingOwnerUserId` (ObjectId -> User, optional)
- `status` (`active` | `disabled`)
- timestamps

Indexes:
- `{ slug: 1 }` unique
- `{ ownerUserId: 1, createdAt: -1 }`

### `OrganizationMember`
- `orgId` (ObjectId -> Organization, required, index)
- `userId` (ObjectId -> User, required, index)
- `role` (`owner` | `admin` | `member` | `viewer`)
- `status` (`active` | `removed`)
- timestamps

Indexes:
- `{ orgId: 1, userId: 1 }` unique
- `{ userId: 1, createdAt: -1 }`

## Permissions (baseline)
- **owner**: full access + can transfer ownership
- **admin**: manage members, manage org settings
- **member**: access product features
- **viewer**: read-only access to product resources

Permission helpers:
- `requireOrgRoleAtLeast(role)` middleware
- `requireOrgPermission(permissionKey)` optional future abstraction

## API endpoints (sketch)
All endpoints below require **JWT**.

### Org lifecycle
- `GET /api/orgs` - list orgs the current user belongs to
- `POST /api/orgs` - create org
- `GET /api/orgs/:orgId` - get org
- `PUT /api/orgs/:orgId` - update org (admin+)
- `DELETE /api/orgs/:orgId` - disable org (owner only)

### Membership
- `GET /api/orgs/:orgId/members` - list members (admin+)
- `PUT /api/orgs/:orgId/members/:userId/role` - change role (owner/admin)
- `DELETE /api/orgs/:orgId/members/:userId` - remove member (owner/admin)

### Active org selection (optional convenience)
- `PUT /api/user/settings` - store `activeOrgId`

## Request/response shape conventions
- Success: `{ "message": "...", "org": { ... } }`
- Lists: `{ "orgs": [...], "pagination": { ... } }`
- Errors: `{ "error": "..." }` with appropriate status codes

## Middleware & auth
- Extend existing `authenticate` middleware usage.
- Add `loadOrgContext` middleware:
  - Validates `:orgId`
  - Ensures membership exists and is `active`
  - Attaches `req.org`, `req.orgMember`

## Activity/audit logging
- Log:
  - org created
  - org updated
  - member role changed
  - member removed

Category suggestion:
- `category: "admin"` for membership changes

## Implementation outline (files)
- `src/models/Organization.js`
- `src/models/OrganizationMember.js`
- `src/controllers/org.controller.js`
- `src/routes/org.routes.js`
- `src/middleware/org.js` (org context + role checks)
- Register in `server.js`: `app.use('/api/orgs', ...)`

## Admin UI (optional)
Add basic forms to `/views/admin-test.ejs`:
- create org
- list orgs
- list org members

## Testing checklist
- Create org, creator becomes `owner`
- List orgs includes newly created org
- Non-member cannot access org endpoints (`403`)
- Admin can change roles except transferring owner (owner only)

## Open questions
- Should `slug` be user-provided or generated?
- Do we support soft-delete vs `disabled` status?
- How do we migrate existing single-tenant resources to org-scoped?
