# RBAC Group Membership Management

## Overview
The admin RBAC interface supports managing group membership for RBAC groups. Membership controls which users inherit roles and grants indirectly via group-role links.

## Data model
- `RbacGroup` defines a group. Groups can be:
  - Global (`isGlobal=true`)
  - Org-scoped (`isGlobal=false`, `orgId` set)
- `RbacGroupMember` links a `userId` to a `groupId`.

## Admin API
All endpoints are mounted under `/api/admin/rbac/*` and protected by Basic Auth.

### User search (org-filtered)
`GET /api/admin/rbac/users?q=...&orgId=...`

- When `orgId` is provided, results are restricted to users with an active `OrganizationMember` record in that org.
- When `orgId` is omitted, search is global.

### Group members
#### List members
`GET /api/admin/rbac/groups/:id/members`

Returns member links enriched with user fields:
- `id` (member link id)
- `userId`
- `email`
- `name`
- `createdAt`

#### Add a single member
`POST /api/admin/rbac/groups/:id/members` body `{ userId }`

Validation:
- Group must exist and be `active`
- For org-scoped groups, the user must be an active member of the group org

#### Bulk add members
`POST /api/admin/rbac/groups/:id/members/bulk` body `{ userIds: string[] }`

Behavior:
- Validates all `userIds` are ObjectIds
- For org-scoped groups, validates all users are active members of the group org
- Inserts using unordered bulk insert to tolerate duplicates

Response:
- `insertedCount`

#### Remove a single member
`DELETE /api/admin/rbac/groups/:id/members/:memberId`

#### Bulk remove members
`POST /api/admin/rbac/groups/:id/members/bulk-remove` body `{ memberIds: string[] }`

Response:
- `deletedCount`

## Admin UI
### RBAC page
The RBAC admin page is served at:
- `GET /admin/rbac`

### Groups tab
The Groups tab provides:
- Group creation
- Group-role assignment
- Group member management:
  - Bulk add by searching users and staging selections
  - Bulk remove via checkbox selection

Org-scoped groups:
- User search is automatically filtered to the group org using the `orgId` query parameter.

## Runtime semantics
RBAC evaluation considers a user’s group memberships as part of role resolution:
- A user inherits roles from group-role links for groups they are a member of.
- For org-scoped groups, membership is only effective for that org.
