# Invitations

## What it is
Email-based invitation system for organizations. Allows members to invite new users to join their organization with specific roles.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/orgs/:slug/invites`
- `/saas/api/invites`

## API

### JWT endpoints
- `POST ${BASE_URL}/api/orgs/:orgId/invites` - Create invite
- `GET ${BASE_URL}/api/orgs/:orgId/invites` - List pending invites
- `DELETE ${BASE_URL}/api/orgs/:orgId/invites/:inviteId` - Revoke invite
- `GET ${BASE_URL}/api/invites/info` - Get invite details (public)
- `POST ${BASE_URL}/api/invites/accept` - Accept invite (public)

## Admin UI
- `/saas/admin/organizations` - Manage organization invites

## Common errors / troubleshooting
- **409 Conflict**: User already a member or invite already pending
- **400 Bad Request**: Invalid/expired token or missing password for new user
- **404 Not Found**: Invite not found or organization doesn't exist
