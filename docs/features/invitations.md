# Invitations

## What it is
Email-based invitation system for organizations. Allows members to invite new users to join their organization with specific roles.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/orgs/:slug/invites`
- `/saas/api/invites`

## API

### JWT endpoints
- `POST /saas/api/orgs/:slug/invites` - Create invite
- `GET /saas/api/orgs/:slug/invites` - List pending invites
- `DELETE /saas/api/orgs/:slug/invites/:inviteId` - Revoke invite
- `GET /saas/api/invites/info` - Get invite details (public)
- `POST /saas/api/invites/accept` - Accept invite (public)

## Admin UI
- `/saas/admin/organizations` - Manage organization invites

## Common errors / troubleshooting
- **409 Conflict**: User already a member or invite already pending
- **400 Bad Request**: Invalid/expired token or missing password for new user
- **404 Not Found**: Invite not found or organization doesn't exist
