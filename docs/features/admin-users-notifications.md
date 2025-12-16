# Admin users & notifications

## What it provides

This feature gives you:

- A basic-auth protected admin UI to inspect and manage users.
- A basic-auth protected admin UI to send notifications (in-app and/or email).
- Admin APIs that you can call directly (useful for scripting or integrating with an internal admin tool).

Admin UI:
- `/admin/users`
- `/admin/notifications`

Admin API (basic auth):
- `/api/admin/users/*`
- `/api/admin/notifications/*`

## When to use it

Use these endpoints/views when you need:

- Manual user support actions (disable/enable accounts, adjust plan/status fields).
- A lightweight way to message users without building a separate back-office.

## Admin API

### User management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List users with pagination, search, filters |
| GET | `/api/admin/users/:id` | Get a single user |
| PATCH | `/api/admin/users/:id` | Update user fields (role/name/subscription fields) |
| POST | `/api/admin/users/:id/disable` | Disable a user (soft-disable) |
| POST | `/api/admin/users/:id/enable` | Enable a user |

List query params:
- `q`: search by email or name (case-insensitive)
- `role`: `user` | `admin`
- `subscriptionStatus`: filter by subscription status
- `currentPlan`: filter by current plan
- `limit`: page size (default 50, max 500)
- `offset`: pagination offset

Example (list users):

```bash
curl -u admin:password "http://localhost:5000/api/admin/users?limit=50&offset=0&q=gmail"
```

Example (disable user):

```bash
curl -X POST -u admin:password "http://localhost:5000/api/admin/users/USER_ID/disable"
```

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/notifications` | List notifications (admin view) |
| GET | `/api/admin/notifications/stats` | Aggregate stats (sent/pending/failed) |
| POST | `/api/admin/notifications/send` | Send to one or more users |
| POST | `/api/admin/notifications/broadcast` | Send to all users |
| DELETE | `/api/admin/notifications/:id` | Delete a notification |

Send body:

```json
{
  "userIds": ["userId1", "userId2"],
  "type": "info",
  "title": "Notification Title",
  "message": "Notification body text",
  "channel": "both",
  "metadata": {}
}
```

Example (send in-app only):

```bash
curl -X POST -u admin:password \
  -H "Content-Type: application/json" \
  -d '{"userIds":["USER_ID"],"type":"info","title":"Hello","message":"Welcome","channel":"in_app"}' \
  "http://localhost:5000/api/admin/notifications/send"
```

## Admin UI workflow

### Manage users (`/admin/users`)

Typical support flows:

1. Find a user by email/name using search.
2. Adjust user properties (role/status/plan).
3. Disable/enable the user.
4. Send a user-specific notification.

### Send notifications (`/admin/notifications`)

1. Choose recipient (a specific user or broadcast).
2. Choose type (`info`, `success`, `warning`, `error`).
3. Choose channel:
   - `in_app`: persists a notification record for the user
   - `email`: sends email via the configured email provider
   - `both`: does both
4. Send.

## Notification channels (developer notes)

- In-app notifications are stored and later retrieved by the app.
- Email delivery depends on the email provider configuration (see the email feature docs when added).
- For email channels, delivery status is tracked on the notification record (`pending`, `sent`, `failed`, `skipped`).

## Troubleshooting

### Email notifications are not delivered

Common causes:

- Email provider/env vars are not configured.
- Provider is configured, but rate limiting or provider errors are occurring.

If you need to confirm behavior quickly, send an `in_app` notification first to validate the pipeline end-to-end.

### I can’t access the admin UI endpoints

- Confirm basic auth credentials are set.
- If you’re running in middleware mode, remember to include the mount prefix (for example `/saas/admin/users`).

