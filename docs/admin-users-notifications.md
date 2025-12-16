# Admin Users & Notifications Management

## Overview

This document describes the implementation of dedicated admin views for **User Management** and **Notifications**, including the enhancement of the notification system to support both in-app and email notifications with recipient targeting.

## Goals

1. **User Management**: Provide admins with a comprehensive view to list, search, filter, and manage system users
2. **Notification System**: Enable admins to send notifications to individual users or broadcast to all users
3. **Dual Channel**: Support both in-app notifications and email notifications

---

## Data Model Changes

### Enhanced Notification Model

The existing `Notification` model is extended with new fields:

```javascript
{
  userId: ObjectId,           // Target user (null for broadcasts stored per-user)
  type: String,               // 'info' | 'success' | 'warning' | 'error'
  title: String,
  message: String,
  read: Boolean,
  metadata: Mixed,
  // NEW FIELDS:
  channel: String,            // 'in_app' | 'email' | 'both' (default: 'in_app')
  emailStatus: String,        // 'pending' | 'sent' | 'failed' | 'skipped' (for email channel)
  emailSentAt: Date,          // When email was sent
  sentByAdminId: String,      // Admin username who sent it (from basicAuth)
  broadcastId: String,        // Groups notifications from same broadcast
}
```

---

## API Endpoints

### User Management (Basic Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List users with pagination, search, filters |
| GET | `/api/admin/users/:id` | Get single user details |
| PATCH | `/api/admin/users/:id` | Update user (role, name, subscriptionStatus) |
| POST | `/api/admin/users/:id/disable` | Disable user account |
| POST | `/api/admin/users/:id/enable` | Re-enable user account |

#### Query Parameters for List

- `q` - Search by email or name (case-insensitive)
- `role` - Filter by role (`user`, `admin`)
- `subscriptionStatus` - Filter by subscription status
- `currentPlan` - Filter by plan
- `limit` - Page size (default 50, max 500)
- `offset` - Pagination offset

### Notification Management (Basic Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/notifications` | List all notifications (admin view) |
| GET | `/api/admin/notifications/stats` | Get notification stats |
| POST | `/api/admin/notifications/send` | Send notification to user(s) |
| POST | `/api/admin/notifications/broadcast` | Send to all users |
| DELETE | `/api/admin/notifications/:id` | Delete a notification |

#### Send Notification Body

```json
{
  "userIds": ["userId1", "userId2"],  // Target users (omit for broadcast)
  "type": "info",                      // info | success | warning | error
  "title": "Notification Title",
  "message": "Notification body text",
  "channel": "both",                   // in_app | email | both
  "metadata": {}                       // Optional extra data
}
```

---

## Admin Views

### `/admin/users`

- **Header**: Title, user count, search box
- **Filters**: Role, subscription status, plan
- **Table columns**: Email, Name, Role, Plan, Status, Created, Actions
- **Actions per row**:
  - View details
  - Edit role
  - Send notification
  - Disable/Enable account
- **Pagination**: Prev/Next with offset tracking

### `/admin/notifications`

- **Header**: Title, stats cards (total sent, pending, failed)
- **Send Form**:
  - Recipient selector (specific user email or "broadcast")
  - Type dropdown
  - Title input
  - Message textarea
  - Channel selector (in-app, email, both)
  - Send button
- **History Table**:
  - Columns: Date, Recipient, Title, Type, Channel, Status, Actions
  - Filters: Type, channel, date range
  - Pagination

---

## Notification Service

A new `notification.service.js` handles:

1. **createNotification**: Creates in-app notification record
2. **sendEmailNotification**: Sends email via `email.service.js`
3. **sendToUser**: Sends notification to single user (in-app and/or email)
4. **broadcast**: Sends notification to all active users

---

## Implementation Files

### New Files

- `src/services/notification.service.js` - Notification sending logic
- `src/controllers/userAdmin.controller.js` - User management endpoints
- `src/controllers/notificationAdmin.controller.js` - Notification admin endpoints
- `src/routes/userAdmin.routes.js` - User admin routes
- `src/routes/notificationAdmin.routes.js` - Notification admin routes
- `views/admin-users.ejs` - User management UI
- `views/admin-notifications.ejs` - Notification management UI

### Modified Files

- `src/models/Notification.js` - Add new fields
- `src/middleware.js` - Mount new routes and views
- `index.js` - Mount new routes and views (standalone)
- `src/admin/endpointRegistry.js` - Register new endpoints
- `views/partials/admin-test-sidebar.ejs` - Add navigation links

---

## Security Considerations

- All admin endpoints protected by `basicAuth`
- Admin actions logged via `audit.service.js`
- Email sending uses existing rate-limited `email.service.js`
- User disable is soft-disable (status field), not hard delete

---

## Future Enhancements

- Email templates stored in GlobalSettings
- Scheduled notifications
- Notification preferences per user
- Push notifications via WebSocket
