# Invitations + Onboarding (Sketch)

## Goal
Provide a reusable onboarding layer:
- Invite users by email (and optionally assign to an org)
- Accept/decline invites
- Track onboarding steps (first login, profile completion, etc.)

This makes it faster to build “invite-only beta”, “team invites”, and guided onboarding flows.

## Non-goals (for v1)
- Full product tours/UI
- SSO/SCIM provisioning

## Core concepts
- **Invite**: signed, expiring token tied to email and optional org/role.
- **Onboarding state**: server-backed flags so frontends can render steps.

## Data model (Mongoose)
### `Invite`
- `email` (string, required, index)
- `tokenHash` (string, required, unique)
- `expiresAt` (date, required, index)
- `status` (`pending` | `accepted` | `revoked` | `expired`)
- `createdByUserId` (ObjectId -> User, required)
- `orgId` (ObjectId -> Organization, optional)
- `role` (string, optional; e.g. `member`)
- `metadata` (Mixed, optional)
- timestamps

Indexes:
- `{ expiresAt: 1 }`
- `{ email: 1, status: 1 }`

### `UserOnboarding`
- `userId` (ObjectId -> User, unique, required)
- `steps` (object)
  - `emailVerified` (bool)
  - `profileCompleted` (bool)
  - `invitesAccepted` (bool)
  - `firstProjectCreated` (bool)
- `completedAt` (date, optional)
- timestamps

## Email integration
Leverage existing email service (`email.service.js`).
- Invite email template variables:
  - `{{appName}}`
  - `{{inviteLink}}`
  - `{{expiresIn}}`

Invite link pattern:
- `PUBLIC_URL + /accept-invite?token=...`

## API endpoints (sketch)
### User-side (public)
- `POST /api/invites/accept`
  - body: `{ token, name?, password? }`
  - If user exists: attach membership / mark accepted
  - If user does not exist: create user + accept

### User-side (JWT)
- `GET /api/onboarding` - get onboarding steps
- `PUT /api/onboarding` - mark steps complete (server validates allowed transitions)

### Admin/team (JWT)
(If you implement orgs, scope to `orgId` + admin role)
- `POST /api/invites` - create invite(s)
- `GET /api/invites` - list invites created by user (or org)
- `DELETE /api/invites/:id` - revoke invite

### Admin (Basic Auth)
- `GET /api/admin/invites` - list all invites (support/debug)

## Security
- Store only `tokenHash` in DB (never store raw token)
- Token format: random bytes + prefix (`inv_...`)
- Reject if:
  - expired
  - revoked
  - already accepted

## Activity logging
- Log:
  - invite_created
  - invite_accepted
  - invite_revoked

## Implementation outline (files)
- `src/models/Invite.js`
- `src/models/UserOnboarding.js`
- `src/controllers/invite.controller.js`
- `src/controllers/onboarding.controller.js`
- `src/routes/invite.routes.js`
- `src/routes/onboarding.routes.js`

## Testing checklist
- Create invite -> email sent (or simulated)
- Accept invite -> creates user (if new) and marks accepted
- Accept invite twice -> `409` or `400`
- Revoked/expired invite -> `400`

## Open questions
- Should invites be org-scoped only, or support “product-wide invites”?
- Should invites support multiple uses (usually no)?
- Should onboarding state live on `User.settings` vs separate model?
