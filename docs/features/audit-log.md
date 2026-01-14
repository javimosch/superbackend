# Audit log

## What it is

This feature stores an append-only audit log of key actions in MongoDB.

It is intended for apps that mount `@intranefr/superbackend` as Express middleware and want:

- A server-side record of admin actions (example: admin updates a user).
- A server-side record of user actions on key endpoints.
- An admin-only UI to search and inspect audit events.

## Base URL / mount prefix

When you mount the middleware under a prefix (example: `/saas`), **all routes are prefixed**.

Example:

- Without prefix: `GET /api/admin/audit`
- With prefix: `GET /saas/api/admin/audit`

In this document we use `${BASE_URL}` which should include the mount prefix.

## Configuration

### Environment variables

- `AUDIT_TRACKING_ENABLED`
  - Optional
  - Default: enabled (anything except `false`)
- `AUDIT_LOG_FAILED_ATTEMPTS`
  - Optional
  - Default: enabled (anything except `false`)
- `AUDIT_RETENTION_DAYS`
  - Optional
  - Default: `90` (retention enforcement is up to the host app; this is a config value only)

### Headers

- `X-Request-Id`
  - If the client provides it, `@intranefr/superbackend` will propagate it.
  - If not provided, `@intranefr/superbackend` will generate one and echo it back in responses.

## API

### User (JWT)

User-facing audit events are created automatically by middleware on key routes.

Action naming convention:

- `public.*` for unauthenticated public endpoints
- `user.*` for authenticated (JWT) endpoints

Currently instrumented routes:

User account (see `src/routes/user.routes.js`):

- `PUT /api/user/profile` -> `user.profile.update`
- `PUT /api/user/password` -> `user.password.change`
- `POST /api/user/password-reset-request` -> `user.password_reset.request`
- `POST /api/user/password-reset-confirm` -> `user.password_reset.confirm`
- `DELETE /api/user/account` -> `user.account.delete`
- `GET /api/user/settings` -> `user.settings.get`
- `PUT /api/user/settings` -> `user.settings.update`

Authentication (see `src/routes/auth.routes.js`):

- `POST /api/auth/register` -> `public.auth.register`
- `POST /api/auth/login` -> `public.auth.login`
- `POST /api/auth/refresh-token` -> `public.auth.refresh`

Billing (see `src/routes/billing.routes.js`):

- `POST /api/billing/create-checkout-session` -> `user.billing.checkout_session.create`
- `POST /api/billing/create-portal-session` -> `user.billing.portal_session.create`
- `POST /api/billing/reconcile-subscription` -> `user.billing.subscription.reconcile`

Organizations and org invites (see `src/routes/org.routes.js`):

- `GET /api/orgs` -> `user.org.list`
- `POST /api/orgs` -> `user.org.create`
- `GET /api/orgs/:orgId` -> `user.org.get`
- `PUT /api/orgs/:orgId` -> `user.org.update`
- `DELETE /api/orgs/:orgId` -> `user.org.delete`
- `POST /api/orgs/:orgId/join` -> `user.org.join`
- `GET /api/orgs/:orgId/members` -> `user.org.members.list`
- `POST /api/orgs/:orgId/members` -> `user.org.member.add`
- `PUT /api/orgs/:orgId/members/:userId/role` -> `user.org.member.role.update`
- `DELETE /api/orgs/:orgId/members/:userId` -> `user.org.member.remove`
- `GET /api/orgs/:orgId/invites` -> `user.org.invites.list`
- `POST /api/orgs/:orgId/invites` -> `user.org.invite.create`
- `DELETE /api/orgs/:orgId/invites/:inviteId` -> `user.org.invite.revoke`

Invite acceptance (see `src/routes/invite.routes.js`):

- `POST /api/invites/accept` -> `user.invite.accept`

Assets (see `src/routes/assets.routes.js`):

- `POST /api/assets/upload` -> `user.asset.upload`
- `DELETE /api/assets/:id` -> `user.asset.delete`

Notifications (see `src/routes/notifications.routes.js`):

- `PUT /api/notifications/:id/read` -> `user.notification.read`
- `POST /api/activity-log` -> `user.activity_log.create`

Public forms and waiting list:

- `POST /api/forms/submit` -> `public.form.submit`
- `POST /api/waiting-list/subscribe` -> `public.waiting_list.subscribe`

Notes:

- Outcome is derived from HTTP status code (`>= 400` is `failure`).
- Actor is derived from `Authorization: Bearer ${TOKEN}` (via `authenticate`).
- Request context includes: ip, userAgent, requestId, path, method.

### Admin (Basic Auth)

#### Audit log admin APIs

- `GET /api/admin/audit` - List events with filters and pagination
- `GET /api/admin/audit/stats` - Summary statistics
- `GET /api/admin/audit/actions` - List unique action names
- `GET /api/admin/audit/:id` - Get single event details

**Query parameters for listing:**
- `actorType`: `user`, `admin_basic`, `system`, `anonymous`
- `actorUserId`: Filter by specific user ID
- `action`: Filter by action name (regex)
- `outcome`: `success`, `failure`
- `targetType`: Filter by target entity type
- `targetId`: Filter by target entity ID
- `q`: Global search query
- `from`/`to`: Date range (ISO format)
- `page`/`pageSize`: Pagination (default 50, max 100)

Example:

```bash
curl -u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" \
  "${BASE_URL}/api/admin/audit?outcome=failure&page=1&pageSize=50"
```

## Admin UI

### Audit log UI

- Route: `GET /admin/audit`
- Requirements: Basic Auth

It can:

- Browse audit events
- Filter by actor type, outcome, action
- View event details (before/after/meta/context)

## Common errors / troubleshooting

- If the audit log is empty:
  - Confirm you are calling instrumented routes with `Authorization: Bearer ${TOKEN}`
  - Confirm `AUDIT_TRACKING_ENABLED` is not set to `false`

## Next steps

- Error tracking feature: `docs/features/error-tracking.md`
