# Organizations

## What it is
Multi-tenant organization support with role-based access control. Users can belong to multiple organizations with different roles (owner, admin, member, viewer).

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/orgs`
- `/saas/api/orgs/:slug/members`

## API

### Public endpoints
- `GET /saas/api/orgs/public` - List public organizations
- `GET /saas/api/orgs/public/:orgId` - Get public organization details

### JWT endpoints
- `GET /saas/api/orgs` - List user's organizations
- `POST /saas/api/orgs` - Create organization
- `GET /saas/api/orgs/:slug` - Get organization
- `PUT /saas/api/orgs/:slug` - Update organization
- `DELETE /saas/api/orgs/:slug` - Delete organization
- `GET /saas/api/orgs/:slug/members` - List members
- `POST /saas/api/orgs/:slug/members` - Add member
- `PUT /saas/api/orgs/:slug/members/:userId` - Update member role
- `DELETE /saas/api/orgs/:slug/members/:userId` - Remove member
- `POST /saas/api/orgs/:slug/join` - Join public organization

## Admin UI
- `/saas/admin/organizations` - Organization management

## Common errors / troubleshooting
- **403 Forbidden**: User lacks permission for the organization
- **404 Not Found**: Organization doesn't exist or user not a member
- **409 Conflict**: User already a member or organization slug exists
