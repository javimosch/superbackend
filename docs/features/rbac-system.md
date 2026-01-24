# RBAC System

## Core Philosophy: Additive & Non-Breaking
The goal is to provide a "RBAC Capability Layer" that parent applications can opt into. We will not modify existing route logic or force a migration. Instead, we offer:
1.  **Capability Registry:** A place to define what can be done.
2.  **Resolution Service:** Helpers to map existing roles to granular permissions.
3.  **Opt-in Middleware:** New decorators for routes that need granular control.

## 1. System Components

### A. Permission engine (`src/utils/rbac/engine.js`)
A stateless utility for matching rights.

- Supports wildcard patterns (`backoffice:*`, `*`).
- Supports `allow` and `deny`.
- Evaluation rule: **deny overrides allow**.

### B. Rights registry (`src/utils/rbac/rightsRegistry.js`)
A lightweight registry used by the Admin UI for autocomplete.

- API: `listRights()`

### C. Resolution service (`src/services/rbac.service.js`)
Resolves a user's effective rights for a given `orgId`.

Key behaviors:
- Checks organization membership (`OrganizationMember`) and fails closed.
- Aggregates grants from multiple subjects (user, role, group, org).
- Roles can be global or org-scoped.
- Groups can be global or org-scoped.
- Users can acquire roles directly (user-role) and indirectly via group-role assignment.
- Supports both global and org-scoped grants.
- Groups can be global or org-scoped (org-scoped groups apply only within their org).

Evaluation semantics:
- Deny precedence: if any matching `deny` exists across any subject layer, the result is denied.
- Allow precedence: if no deny matched, the system selects allow by layer priority: `org` -> `group` -> `role` -> `user`.

Public service APIs:
- `getUserOrgIds(userId)`
- `getEffectiveGrants({ userId, orgId })`
- `checkRight({ userId, orgId, right })` -> `{ allowed, reason, decisionLayer, explain, context }`

## 2. Data model (Mongoose)

- `RbacRole` (`rbac_roles`)
- `RbacUserRole` (`rbac_user_roles`) links users to RBAC roles
- `RbacGroup` (`rbac_groups`) supports `isGlobal` and optional `orgId`
- `RbacGroupMember` (`rbac_group_members`) links users to groups
- `RbacGroupRole` (`rbac_group_roles`) links groups to roles
- `RbacGrant` (`rbac_grants`) assigns a `right` with `effect` (`allow|deny`) to a subject in a scope
  - `subjectType`: `user|role|group|org`
  - `scopeType`: `global|org`

## 3. Integration APIs

### A. Middleware (`src/middleware/rbac.js`)
Middleware for protecting application routes:

- `requireRight(requiredRight, { getOrgId })`

Super-admin bypass:
- Only **valid Basic Auth** credentials bypass RBAC checks.

### B. Public API routes (JWT)
Mounted at `GET/POST /api/rbac/*`:

- `GET /api/rbac/my-orgs` -> `{ orgIds }`
- `GET /api/rbac/my-rights?orgId=...` -> `{ grants, explain }`
- `POST /api/rbac/check` body `{ orgId, right }` -> `{ allowed, reason, decisionLayer }`

### C. Admin API routes (basicAuth)
Mounted at `/api/admin/rbac/*` and protected by Basic Auth.

- Rights registry:
  - `GET /api/admin/rbac/rights`
- Users helper endpoints:
  - `GET /api/admin/rbac/users?q=...`
  - `GET /api/admin/rbac/users/:userId/orgs`
- Rights test:
  - `POST /api/admin/rbac/test` body `{ userId, orgId, right }` -> `{ allowed, reason, decisionLayer, explain, context }`
- Roles:
  - `GET /api/admin/rbac/roles`
  - `POST /api/admin/rbac/roles`
  - `PATCH /api/admin/rbac/roles/:id`
- User roles:
  - `GET /api/admin/rbac/users/:userId/roles`
  - `POST /api/admin/rbac/users/:userId/roles`
  - `DELETE /api/admin/rbac/users/:userId/roles/:userRoleId`
- Groups + members:
  - `GET /api/admin/rbac/groups`
  - `POST /api/admin/rbac/groups`
  - `PATCH /api/admin/rbac/groups/:id`
  - `GET /api/admin/rbac/groups/:id/members`
  - `POST /api/admin/rbac/groups/:id/members`
  - `DELETE /api/admin/rbac/groups/:id/members/:memberId`

- Group roles:
  - `GET /api/admin/rbac/groups/:id/roles`
  - `POST /api/admin/rbac/groups/:id/roles` body `{ roleId }`
  - `DELETE /api/admin/rbac/groups/:id/roles/:groupRoleId`
- Grants:
  - `GET /api/admin/rbac/grants`
  - `POST /api/admin/rbac/grants`
  - `DELETE /api/admin/rbac/grants/:id`

All admin mutations are audit-logged via `createAuditEvent`.

## 4. Admin UI

Admin UI page:
- `GET /admin/rbac` (Basic Auth)

Includes:
- Rights tester with:
  - user autocomplete
  - org selector only if user has more than one org
  - right autocomplete
  - test result + decision layer + matched grants explanation
  - effective context (groups and roles used for the evaluation)

- RBAC sub-tabs:
  - Rights: tester + grants
  - Groups: group creation + group↔role assignment
  - Roles: role creation (global/org) + roles list

## Security invariants

- Fail-closed: org membership is required for checks.
- Deny overrides allow.
- Basic-auth super-admin bypass.
