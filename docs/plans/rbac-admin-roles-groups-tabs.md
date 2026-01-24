---
description: RBAC Admin UI - add Roles/Groups tabs, group↔role assignment, and updated evaluation priority
---

# Goal
Extend the existing RBAC Admin page (`/admin/rbac`, `views/admin-rbac.ejs`) to include sub-tabs:

- Rights (existing functionality)
- Groups (new management section)
- Roles (new management section)

And extend the RBAC model so:

- Groups can be assigned one or many roles.
- Users belonging to a group automatically inherit the group’s roles (and thus the rights granted to those roles).
- Evaluation follows the requested priority order:
  - Org
  - Group
  - Roles (both direct user roles and group-acquired roles)
  - User

# Current State (baseline)
- Models exist:
  - `RbacRole` (global only today; has `key`, `name`, `description`, `status`)
  - `RbacUserRole` (user ↔ role)
  - `RbacGroup` (global/org-scoped via `isGlobal` + `orgId`)
  - `RbacGroupMember` (user ↔ group)
  - `RbacGrant` (subject: user|role|group|org; scope: global|org)
- Resolution service (`src/services/rbac.service.js`) currently aggregates grants from user, role, group, org.
- Admin API exists (`/api/admin/rbac/*`) with basic CRUD for roles, groups, group members, user roles, grants.
- RBAC Admin UI exists with:
  - “Test rights” panel
  - “Create grant” form
  - “Grants” list

# Proposed Changes

## Locked-in decisions

- Evaluation semantics:
  - Global deny wins (any matching deny from any layer denies).
  - If no deny matches, allow is selected by layer priority: `org` -> `group` -> `role` -> `user`.
- Role `key` uniqueness:
  - Unique among global roles.
  - Unique per org for org-scoped roles.
- Group↔role scoping rules:
  - Org-scoped groups can include global roles.
  - Global groups cannot include org-scoped roles.
- Explain output:
  - Include role acquisition context (direct user roles and group-acquired roles).

## A) Data model changes

### A1) Add scoping to roles (global vs org-scoped)
**Why**: requirement: “Admin creates roles and set them as org-scoped or global”.

**Change**: extend `RbacRole` schema to include either:
- `isGlobal: Boolean` + `orgId: ObjectId|null` (same pattern as groups), OR
- `scopeType: 'global'|'org'` + `scopeId: ObjectId|null`

Recommendation: reuse the group pattern (`isGlobal` + `orgId`) for consistency.

**Constraints**:
- `key` uniqueness needs clarification:
  - Option 1: unique globally (current behavior)
  - Option 2: unique per org for org-scoped roles, and unique among global roles

### A2) Add group↔role assignment
**Why**: requirement: “Groups can be assign with one/many roles”.

Two options:

- Option 1 (recommended): new join collection `RbacGroupRole`
  - fields: `groupId`, `roleId`
  - unique index `(groupId, roleId)`
  - allows many-to-many without document bloat

- Option 2: embed roleIds inside `RbacGroup`
  - field: `roleIds: ObjectId[]`
  - simpler reads, but potentially unbounded array growth

Recommendation: **Option 1** (join collection) because it matches existing patterns (`RbacUserRole`, `RbacGroupMember`).

### A3) Clarify scoping compatibility rules
We need to define which combinations are allowed:
- global group ↔ org-scoped role (probably disallow)
- org-scoped group ↔ global role (allow?)
- org-scoped group ↔ org-scoped role (same org only)

Recommendation:
- A global group may only have global roles.
- An org-scoped group may have:
  - global roles
  - org-scoped roles in the same org

## B) RBAC evaluation semantics (priority)

### B1) Requested order
Requested “Deny/Allow priority order”:
- Org
- Group
- Roles (direct user roles and group-acquired roles)
- User

### B2) Required lock-in: what does “priority” mean?
Two possible interpretations:

- Interpretation 1: **Layer override**
  - Find the *highest priority layer* that has *any match*.
  - Decide using only that layer’s matching grants (deny beats allow within the layer).
  - Lower layers are ignored once a higher priority match exists.

- Interpretation 2: **Global deny always wins** (current engine behavior)
  - Collect all matching grants from all sources.
  - If any deny matches anywhere → denied.
  - Else if any allow matches anywhere → allowed.

Your earlier expectation (“closest match is deny”) was consistent with Interpretation 1.

Recommendation: implement **Interpretation 1** (layer override), because it matches the priority list you provided.

### B3) Within-layer specificity
Within a layer, define ordering for:
- exact right vs wildcard (`users:manage` should beat `users:*`)
- org-scoped vs global scope

Recommendation:
- exact beats wildcard
- org-scoped beats global
- deny beats allow

(We can implement this by computing a per-grant score and sorting candidates before deciding.)

## C) Service changes (`src/services/rbac.service.js`)

### C1) Add group-acquired roles into effective role set
- For a given user, load:
  - direct user roles (`RbacUserRole`)
  - group memberships (`RbacGroupMember`)
  - group roles via new mapping (`RbacGroupRole`)
- Build the effective roleIds set = direct roleIds ∪ groupRoleIds

### C2) Evaluate by layers
Instead of passing a single concatenated list into `evaluateEffects`, compute results per layer:

- Org layer: grants with subjectType=org
- Group layer: grants with subjectType=group (including org/global scopes allowed for those groups)
- Roles layer: grants with subjectType=role (for effective roleIds)
- User layer: grants with subjectType=user

Then decide using the locked-in priority semantics.

### C3) Explain output
Update explain payload to include:
- source layer (`org`, `group`, `role`, `user`)
- source detail (e.g. `role:direct`, `role:via_group:<groupId>`)

This is important so the “Test rights” panel can show *why* a role was included.

## D) Admin API changes (`/api/admin/rbac/*`)

### D1) Roles endpoints
Existing endpoints already exist for role CRUD. Extend them for scoping:
- create role: accept `isGlobal`, `orgId`
- list roles: support filtering by `scope` and/or `orgId`

### D2) Groups endpoints
Existing endpoints already exist for group CRUD + members. Extend them with:

- Group roles management:
  - `GET /api/admin/rbac/groups/:id/roles`
  - `POST /api/admin/rbac/groups/:id/roles` (assign role to group)
  - `DELETE /api/admin/rbac/groups/:id/roles/:roleId` (remove role from group)

Rules to enforce:
- cannot assign disabled roles
- scoping compatibility rules (see A3)

### D3) Rights (grants)
No structural API changes required, but UI will become more usable if we add helper endpoints:
- `GET /api/admin/rbac/roles?q=...` (search)
- `GET /api/admin/rbac/groups?q=...` (search)

(So we don’t require manual ObjectId entry in the UI.)

## E) RBAC Admin UI changes (`views/admin-rbac.ejs`)

### E1) Sub-tabs layout
Add a simple sub-tab header inside the RBAC page:
- Rights (default)
- Groups
- Roles

Implementation approach: client-only state `activeTab` in the Vue app.

### E2) Rights tab
Move current contents into “Rights” tab:
- Test rights panel
- Create grant
- Grants list

### E3) Roles tab
UI features:
- list roles (with scope badge)
- create role form:
  - name
  - code/key (unique)
  - scope: global vs org
  - org selection if org-scoped

Optional (phase 2): edit role, disable role

### E4) Groups tab
UI features:
- list groups (with scope badge)
- create group form:
  - name
  - scope
  - org selection if org-scoped

Group detail panel:
- members list + add/remove member
- roles assigned to group:
  - list assigned roles
  - assign role (autocomplete)
  - remove role

## F) Migration / Backward compatibility
- Existing roles are implicitly global; when adding scoping fields, migrate them to `isGlobal=true`.
- Existing grants referencing roles remain valid.
- Ensure indexes updated safely (especially role key uniqueness).

# Open Questions (need your answers before implementation)

1) **Priority semantics**: confirm Interpretation 1 (layer override) vs Interpretation 2 (global deny always wins).

2) **Role key uniqueness**:
- Should `role.key` be unique globally (even for org roles), or unique per org?

3) **Group↔Role scoping rules**: confirm the compatibility rules in A3.

4) **Role acquisition explain**:
- In the Test panel, do you want to see the intermediate “user is in group X, group X has roles [A,B]” explanation, or only matched grants?

# Implementation Phasing (recommended)

- Phase 1
  - Add role scoping
  - Add `RbacGroupRole`
  - Update rbac service to include group-acquired roles
  - Update evaluation to use priority-by-layer

- Phase 2
  - Expand admin API endpoints for group roles
  - Expand RBAC UI with tabs + basic CRUD + assignment UIs

# Acceptance Criteria
- Roles and Groups tabs exist inside `/admin/rbac`.
- Admin can create org-scoped/global roles and groups.
- Admin can assign multiple roles to a group.
- A user in a group receives the group’s roles.
- Rights testing respects the priority list (as locked in).
- “Explain” output makes it clear *which layer* determined the decision.

# Final implementation notes

## Models

- `src/models/RbacRole.js`
  - Added `isGlobal` and `orgId`.
  - Implemented per-org unique `key` using partial unique indexes.
- `src/models/RbacGroupRole.js`
  - New join model linking `groupId` -> `roleId`.

## Admin API

- Roles:
  - `POST /api/admin/rbac/roles` accepts `isGlobal`, `orgId`.
  - `PATCH /api/admin/rbac/roles/:id` supports updating scope.
  - `GET /api/admin/rbac/roles` normalizes `orgId` to string.
- Group roles:
  - `GET /api/admin/rbac/groups/:id/roles`
  - `POST /api/admin/rbac/groups/:id/roles` body `{ roleId }` (with scoping validation)
  - `DELETE /api/admin/rbac/groups/:id/roles/:groupRoleId`
- Test endpoint:
  - `POST /api/admin/rbac/test` now returns `decisionLayer` and `context` in addition to `{ allowed, reason, explain }`.

## RBAC service

- `src/services/rbac.service.js`
  - Resolves effective roles as: direct user roles + group-acquired roles.
  - Evaluates denies across all layers first.
  - If no deny, selects allow by layer priority `org -> group -> role -> user`.

## Admin UI

- `views/admin-rbac.ejs`
  - Added sub-tabs: Rights / Groups / Roles.
  - Rights tab contains the existing tester + grants UI.
  - Groups tab includes group creation and group↔role assignment UI.
  - Roles tab includes scoped role creation and roles list.
