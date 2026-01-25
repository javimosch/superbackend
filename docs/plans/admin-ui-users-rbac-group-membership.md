---
description: Plan changes to allow assigning/unassigning users to existing RBAC groups from Admin UI
---

# Problem
The Admin UI currently has:

- `admin-users.ejs`: user listing and editing (name/role/plan/subscription, enable/disable, notify, etc.)
- `admin-rbac.ejs`: RBAC management for rights/grants/roles/groups

However, there is **no UI flow to assign/unassign users into existing RBAC groups**.

Notes from current implementation:

- Backend already supports group membership via:
  - `GET /api/admin/rbac/groups/:id/members`
  - `POST /api/admin/rbac/groups/:id/members` (body `{ userId }`)
  - `DELETE /api/admin/rbac/groups/:id/members/:memberId`
- The RBAC “Groups” tab UI currently supports **creating groups** and **assigning roles to groups**, but does not manage **group members**.
- The Users admin UI is separate and does not expose RBAC group membership.

# Plan lock-in (Jan 2026)
- Option selected: **Option A** (RBAC page, group-centric)
- Org-scoped groups: **strict validation** (only users who are active org members can be assigned)
- Bulk operations: **required** (bulk add + bulk remove)

# Goals
- Allow an admin to:
  - Add a user to one or more existing RBAC groups
  - Remove a user from one or more existing RBAC groups
- Keep the change minimal and consistent with the existing Admin UI patterns.
- Ensure org-scoped groups are handled safely (see Scoping rules / validation below).

# Non-goals
- Implementing a full “enterprise directory” UX (bulk assignments, CSV import, etc.).
- Changing the core RBAC evaluation rules.

# Proposed UX options
## Option A (recommended): Add “Group members” management to `admin-rbac.ejs`
Add a new card under the existing Groups tab:

- **Group members**
  - Select group (existing `selectedGroupId` dropdown can be reused, or a separate selector)
  - Search users by email/name (reuse `/api/admin/rbac/users?q=...` endpoint)
  - “Add to group” button
  - List current members with “Remove” button

Rationale:
- RBAC-related operations live in `admin-rbac.ejs` already.
- Backend endpoints already align with “manage membership by group”.

## Option B: Add “RBAC Groups” section inside “Edit User” modal in `admin-users.ejs`
Add an RBAC section in the edit modal:

- Show current groups for user
- Multi-select or checkbox list of groups
- Save applies membership changes

Rationale:
- A more user-centric flow (“edit user -> groups”).

Tradeoff:
- Requires additional backend support to list groups for a user and to remove membership by `userId`+`groupId` (current delete endpoint requires `memberId`).

# Backend/API changes
Even if we implement Option A only, we should still consider adding a small helper endpoint for better UX.

## 1) Add endpoint: list groups for a user
Add:

- `GET /api/admin/rbac/users/:userId/groups`

Response shape:
- `groups: [{ memberId, groupId, name, isGlobal, orgId, status, createdAt }]`

Implementation idea:
- Query `RbacGroupMember.find({ userId })`
- Fetch referenced groups by `_id` and enrich with `name/isGlobal/orgId/status`

This endpoint is useful for:
- Option B (Edit User modal)
- Future enhancements (display group badges in user listing)

## 2) Add endpoint: remove user from group by `userId` + `groupId` (optional but recommended)
Current delete operation requires a `memberId`, which is annoying for user-centric flows.

Add:

- `DELETE /api/admin/rbac/users/:userId/groups/:groupId`

Implementation idea:
- `RbacGroupMember.findOneAndDelete({ userId, groupId })`

Also consider:
- `POST /api/admin/rbac/users/:userId/groups` with `{ groupId }` as a user-centric mirror of `POST /groups/:id/members`.

If we keep only group-centric endpoints (Option A), we may skip these and just use `memberId` from `listGroupMembers`.

# Scoping rules / validation
RBAC groups can be:

- Global (`isGlobal=true`)
- Org-scoped (`isGlobal=false`, `orgId` set)

In `rbac.service.js`, group membership is only considered for an org if:
- The user is an active org member, and
- The group is global OR the group’s `orgId` matches the org.

To prevent confusing assignments, in Admin UI we should:

- For org-scoped groups:
  - Only allow adding a user to an org-scoped group if the user is an active member of that org.
  - UX options:
    - Filter out org-scoped groups unless an “Org context” is selected.
    - Or show them but disable with a hint.

We can reuse existing endpoint:
- `GET /api/admin/rbac/users/:userId/orgs`

# Data integrity / error handling
- Attempting to add an existing membership should return a clear error (unique index exists on `{ groupId, userId }`). UI should show a friendly message.
- All membership changes should create audit events (already done for existing endpoints; ensure new endpoints do too).

# Implementation plan (next steps)
1. Extend UI (Option A recommended) in `views/admin-rbac.ejs`:
   - Add “Group members” card
   - Implement user search + add member
   - List members + remove
2. Add backend helper endpoint(s):
   - `GET /api/admin/rbac/users/:userId/groups` (recommended)
   - Optional: user+group delete endpoint for user-centric flows
3. Add scoping validation:
   - Disallow adding user to org-scoped group unless user is active in that org
4. Add minimal tests for new controller routes (if added):
   - Success cases
   - Invalid IDs
   - Org-scoped validation

# Final implementation details

## Backend

### Org-filtered user autocomplete
`GET /api/admin/rbac/users` now supports an optional `orgId` query parameter.

- When `orgId` is provided, the controller searches only users that are **active** `OrganizationMember` records for that org.
- Used by the RBAC Group Members UI for org-scoped groups.

### Group membership validation
`POST /api/admin/rbac/groups/:id/members` now validates:

- Group exists and is `active`
- If group is org-scoped, the user must be an **active member** of the group org

### Bulk membership endpoints
Added bulk endpoints:

- `POST /api/admin/rbac/groups/:id/members/bulk` body `{ userIds: string[] }`
  - Validates ObjectIds
  - Enforces org membership for org-scoped groups
  - Uses `insertMany(..., { ordered: false })` to allow partial success when duplicates exist
  - Audit logged (`admin.rbac.group_member.bulk_add`)

- `POST /api/admin/rbac/groups/:id/members/bulk-remove` body `{ memberIds: string[] }`
  - Deletes by `groupId` + `_id in memberIds`
  - Audit logged (`admin.rbac.group_member.bulk_remove`)

## Admin UI (RBAC)

### Groups tab
Added a **Group members** card to `views/admin-rbac.ejs`:

- Shares the same `selectedGroupId` selector as Group Roles.
- User search:
  - Global groups: search across all users
  - Org-scoped groups: search is filtered to the group org via `orgId` param
- Bulk add:
  - Search + “staging” list of users to add
  - Single “Add to group” action calls the bulk endpoint
- Bulk remove:
  - Checkbox selection + “Select all”
  - “Remove selected” calls bulk-remove endpoint

## Tests
Added `src/controllers/adminRbac.controller.test.js` covering:

- `searchUsers` with `orgId`
- Org-scoped membership validation
- Bulk add success + denied users + duplicate-key tolerance
- Bulk remove

# Open questions (please confirm)
1. Should the primary UX live in:
   - `admin-rbac.ejs` (group-centric),
   - `admin-users.ejs` (user-centric),
   - or both?
2. For org-scoped groups, do you want:
   - Strict enforcement (block assignment if user not in org), or
   - Allow assignment but it only becomes effective when user joins org?
3. Do you need bulk assignment (multi-user / multi-group) or is single-user operations enough for now?
