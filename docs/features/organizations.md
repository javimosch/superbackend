# Organizations

## What it is
Multi-tenant organization support with role-based access control. Users can belong to multiple organizations with different roles (owner, admin, member, viewer).

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/orgs`
- `/saas/api/orgs/:slug/members`

## API

### Public endpoints
- `GET ${BASE_URL}/api/orgs/public` - List public organizations
- `GET ${BASE_URL}/api/orgs/:orgId/public` - Get public organization details

### JWT endpoints
- `GET ${BASE_URL}/api/orgs` - List user's organizations
- `POST ${BASE_URL}/api/orgs` - Create organization
- `GET ${BASE_URL}/api/orgs/:orgId` - Get organization
- `PUT ${BASE_URL}/api/orgs/:orgId` - Update organization
- `DELETE ${BASE_URL}/api/orgs/:orgId` - Delete organization
- `GET ${BASE_URL}/api/orgs/:orgId/members` - List members
- `POST ${BASE_URL}/api/orgs/:orgId/members` - Add member
- `PUT ${BASE_URL}/api/orgs/:orgId/members/:userId/role` - Update member role
- `DELETE ${BASE_URL}/api/orgs/:orgId/members/:userId` - Remove member
- `POST ${BASE_URL}/api/orgs/:orgId/join` - Join public organization

## Admin UI
- `/saas/admin/organizations` - Organization management

## Common errors / troubleshooting
- **403 Forbidden**: User lacks permission for the organization
- **404 Not Found**: Organization doesn't exist or user not a member
- **409 Conflict**: User already a member or organization slug exists
