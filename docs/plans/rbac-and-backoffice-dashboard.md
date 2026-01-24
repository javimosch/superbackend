---
 description: RBAC system + Admin UI (management + rights tester)
---

# Goal
Introduce a flexible RBAC system that works alongside existing auth (JWT users + org membership) and supports assigning access rights to:
- Users
- User Roles (shared across orgs; separate from the current `User.role` which is system-level `user|admin`)
- Groups of users (new)
- Organizations

Also:
- Provide programmatic + API ways to check rights
- `basicAuth` admin is **super-admin** and must bypass all RBAC checks
- Provide a dedicated Admin UI to manage RBAC and a built-in “Test rights” section.

# Current system constraints / facts
- JWT auth uses `src/middleware/auth.authenticate` and sets `req.user`.
- Organizations use `src/middleware/org.loadOrgContext` + `OrganizationMember` and existing role checks (`requireOrgRole`, `requireOrgRoleAtLeast`).
- `basicAuth` is used for existing admin UI + `/api/admin/*` and should be treated as super-admin.
- No `/backoffice/*` routes exist currently (and we will not introduce any in this feature).

# Design principles
- Additive and non-breaking: existing routes using org role checks continue to work.
- RBAC checks should be opt-in per route (new middleware) and available as a service for programmatic checks.
- Fail closed for protected endpoints.
- Provide a clear precedence model and a simple way to debug “why access denied”.

# Concepts
## 1) Rights (permissions)
- Canonical string identifiers, e.g.
  - `backoffice:dashboard:access`
  - `users:manage`
  - `orgs:manage`
- Support wildcards (optional): `backoffice:*`, `*:*:*`.

## 2) Subjects (who receives rights)
- User (`userId`)
- Role (`roleId`) – shared across orgs
- Group (`groupId`) – can be global or org-scoped (selectable per group)
- Organization (`orgId`) – applies to any member of the org (subject to membership)

## 3) Scope
We will support 2 scopes for rights assignments:
- Global scope: applies regardless of org
- Org scope: applies only within a specific org

Rationale: you want org-related assignment, but also roles shared across orgs.

# Data model (Mongoose)
Introduce new collections:

## A) `RbacRole`
- `_id`
- `key` (string, unique; e.g. `backoffice-analyst`)
- `name` (string)
- `description` (string)
- `status` (`active|disabled`)
- timestamps

## B) `RbacGroup`
- `_id`
- `name` (string)
- `description` (string)
- `status` (`active|disabled`)
- `orgId` (optional; if we choose org-scoped groups)
- timestamps

## C) `RbacGroupMember`
- `_id`
- `groupId` (index)
- `userId` (index)
- timestamps
- unique compound index `{ groupId, userId }`

## D) `RbacGrant`
Single “grant” table for all assignments.
- `_id`
- `subjectType` enum: `user|role|group|org`
- `subjectId` (ObjectId)
- `scopeType` enum: `global|org`
- `scopeId` (ObjectId, optional; required when `scopeType=org`)
- `right` (string; indexed)
- `effect` enum: `allow|deny` (deny optional in v1; plan for it)
- `createdBy` (actor info)
- timestamps

Indexes:
- `{ subjectType, subjectId, scopeType, scopeId, right }` unique
- `{ right, scopeType, scopeId }`

## E) User link to RBAC Roles (optional)
Option 1 (recommended): assign roles via grants (subjectType=`role`) and user-to-role mapping via a join collection:
- `RbacUserRole`: `{ userId, roleId }` unique

Option 2: store roleIds array in `User` (less flexible; harder to query in admin UI).

# Effective permissions resolution
Create `rbacService.getEffectiveRights({ userId, orgId })`.

Inputs:
- `userId` (required)
- `orgId` (optional)

Resolution sources:
1. Direct user grants (global + org-scoped)
2. Role grants (from user’s RBAC roles)
3. Group grants (from groups user belongs to)
4. Org grants (if orgId provided and user is a member of that org)

Precedence:
- Deny beats allow
- More specific scope beats global (org-scoped > global)

Output:
- `rights: string[]` (flattened)
- `explain` (optional): structured reasons for debug/UI

Matching:
- `hasRight(rights, requiredRight)` supports exact match and wildcard matching.

Super-admin bypass:
- If request is authenticated via `basicAuth`, bypass.
- `req.user.role === 'admin'` does not bypass RBAC (it is not super-admin).

# Middleware
## A) API middleware: `requireRight(requiredRight, opts)`
- Uses `authenticate` (JWT) + optionally `loadOrgContext` if org-scoped.
- If `basicAuth` is present and valid => allow.
- Else resolve effective rights via `rbacService`.
- If not allowed => `403`.

## B) View middleware for backoffice pages
- A small middleware for `/backoffice/*` routes that:
  - authenticates JWT from cookies or Authorization header (decision below)
  - checks required right
  - renders EJS view or returns 401/403

# API surface
## Public (JWT)
- `GET /api/rbac/my-rights?orgId=...`
  - returns effective rights for the current user (+ optional explain)

- `POST /api/rbac/check`
  - input: `{ right, orgId }`
  - output: `{ allowed: boolean }`

## Admin (basicAuth)
These endpoints are for RBAC management UI.
- `GET/POST/PATCH /api/admin/rbac/roles`
- `GET/POST/PATCH /api/admin/rbac/groups`
- `GET/POST/DELETE /api/admin/rbac/groups/:groupId/members`
- `GET/POST/DELETE /api/admin/rbac/grants`
  - manage grants for any subject type

All admin RBAC mutations must be audit logged.

# Admin UI
Create a dedicated admin page (basicAuth protected) e.g. `/admin/rbac` with:
- Roles CRUD
- Groups CRUD + group members management
- Grants management:
  - Choose subject type (user/role/group/org)
  - Choose scope (global/org)
  - Assign rights (string input with autocomplete from a registry)
- “Test rights” panel:
  - select an existing user (autocomplete)
  - select org (only shown when user belongs to more than one org)
  - enter a right string (autocomplete)
  - click Test to check whether the user has the right in the selected org context
  - include a basic explanation of why the check passed/failed (sources of matching grants)

# Rollout plan (phased)
## Phase 1: Core RBAC engine + models
- Implement models: `RbacRole`, `RbacGroup`, `RbacGroupMember`, `RbacGrant`, `RbacUserRole`.
- Implement RBAC engine util: wildcard matching, allow/deny evaluation.
- Implement `rbacService` effective rights resolution.
- Add unit tests for:
  - wildcard matching
  - resolution precedence
  - org-scoped vs global

## Phase 2: API + middleware
- Add `src/middleware/rbac.js` with `requireRight`.
- Add `/api/rbac/*` routes for programmatic checks.
- Add `/api/admin/rbac/*` routes for management (basicAuth).
- Ensure basicAuth super-admin bypass.
- Add audit logging for all admin RBAC operations.

## Phase 3: Admin UI
- Add `/admin/rbac` view, consistent with other admin pages.
- Provide ability to:
  - create roles
  - create groups
  - add users to groups
  - assign grants
  - test rights (user + optional org + right)

# Locked decisions
1. Only `basicAuth` is super-admin (bypasses all RBAC checks).
2. Groups: both global and org-scoped groups are supported (selectable per group).
3. Deny overrides allow (deny is supported; in practice allow-only will be common).
4. Checks are org-specific (org selector in UI; only shown if user has >1 org).
5. No backoffice browser module is created in this feature.
