# Notifications System

## What it is

A multi-channel notification system for in-app notifications and email alerts. Users receive notifications through:
- **In-app** - Stored in database, accessible via API
- **Email** - Sent via configured email provider (optional per notification)

The system supports:
- User-targeted notifications
- Broadcast notifications to all/multiple users
- Activity log and action event tracking
- Admin management UI

## Base URL / mount prefix

When mounted at `/saas`, all routes are prefixed:
- `/saas/api/notifications`
- `/saas/api/admin/notifications`

In this document we use `${BASE_URL}` which should include the mount prefix.

## Configuration

### Environment variables

- `SMTP_ENABLED`
  - Optional
  - Default: enabled
  - Controls whether email notifications can be sent

## API

### User (JWT) - Fetch and manage notifications

#### Get notifications
```
GET ${BASE_URL}/api/notifications
```

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "notifications": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "type": "info|success|warning|error",
      "title": "Notification title",
      "message": "Notification message",
      "channel": "in_app|email|both",
      "read": false,
      "createdAt": "2024-01-15T10:30:00Z",
      "metadata": {}
    }
  ]
}
```

#### Mark notification as read
```
PUT ${BASE_URL}/api/notifications/:id/read
```

**Authentication:** Required

**Response:**
```json
{
  "notification": {
    "_id": "507f1f77bcf86cd799439011",
    "read": true
  }
}
```

#### Get activity log
```
GET ${BASE_URL}/api/notifications/activity-log
```

**Authentication:** Required

**Query parameters:**
- `limit` (optional, default: 50) - Number of entries to return
- `skip` (optional, default: 0) - Number of entries to skip
- `actionType` (optional) - Filter by action type (e.g., `user.profile.update`)

**Response:**
```json
{
  "activities": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "actionType": "user.profile.update",
      "entityType": "User",
      "entityId": "507f1f77bcf86cd799439012",
      "changes": { "name": { "old": "John", "new": "Jane" } },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 150
}
```

#### Create activity log entry
```
POST ${BASE_URL}/api/notifications/activity-log
```

**Authentication:** Required

**Body:**
```json
{
  "actionType": "string",
  "entityType": "string",
  "entityId": "string",
  "changes": {}
}
```

**Response:**
```json
{
  "activity": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "actionType": "user.profile.update",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Admin - Send and manage notifications

#### Get notification stats
```
GET ${BASE_URL}/api/admin/notifications/stats
```

**Authentication:** Basic auth (admin)

**Response:**
```json
{
  "total": 1500,
  "unread": 320,
  "byType": {
    "info": 500,
    "success": 600,
    "warning": 300,
    "error": 100
  },
  "byChannel": {
    "in_app": 1000,
    "email": 400,
    "both": 100
  }
}
```

#### List all notifications
```
GET ${BASE_URL}/api/admin/notifications
```

**Authentication:** Basic auth

**Query parameters:**
- `userId` (optional) - Filter by user
- `type` (optional) - Filter by notification type
- `read` (optional, boolean) - Filter by read status
- `limit` (optional, default: 50)
- `skip` (optional, default: 0)

**Response:**
```json
{
  "notifications": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "type": "info",
      "title": "Welcome",
      "message": "Welcome to our platform",
      "channel": "both",
      "read": false,
      "emailStatus": "sent|failed|pending|skipped",
      "emailSentAt": "2024-01-15T10:30:00Z",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 150
}
```

#### Send notification to user
```
POST ${BASE_URL}/api/admin/notifications/send
```

**Authentication:** Basic auth

**Body:**
```json
{
  "userId": "507f1f77bcf86cd799439012",
  "type": "info|success|warning|error",
  "title": "Notification title",
  "message": "Notification message",
  "channel": "in_app|email|both"
}
```

**Response:**
```json
{
  "notification": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "type": "info",
    "channel": "both",
    "emailStatus": "pending|sent",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Broadcast notification to all users
```
POST ${BASE_URL}/api/admin/notifications/broadcast
```

**Authentication:** Basic auth

**Body:**
```json
{
  "type": "info|success|warning|error",
  "title": "Broadcast title",
  "message": "Message for all users",
  "channel": "in_app|email|both",
  "targetUserIds": ["id1", "id2"] // optional, if omitted broadcasts to all
}
```

**Response:**
```json
{
  "broadcastId": "507f1f77bcf86cd799439011",
  "recipientCount": 250,
  "sentAt": "2024-01-15T10:30:00Z"
}
```

#### Delete notification
```
DELETE ${BASE_URL}/api/admin/notifications/:id
```

**Authentication:** Basic auth

**Response:**
```json
{
  "message": "Notification deleted"
}
```

#### Retry failed email notification
```
POST ${BASE_URL}/api/admin/notifications/:id/retry-email
```

**Authentication:** Basic auth

**Response:**
```json
{
  "notification": {
    "_id": "507f1f77bcf86cd799439011",
    "emailStatus": "pending",
    "retryCount": 1
  }
}
```

## Admin UI

- `/saas/admin/notifications` - Notifications dashboard and management

## Common errors / troubleshooting

- **401 Unauthorized**: Missing or invalid token/credentials
- **400 Missing userId**: Required field not provided when sending to user
- **404 Notification not found**: Invalid notification ID
- **500 Email delivery failed**: SMTP configuration error or provider down

### Error response examples

**Missing required field:**
```json
{
  "error": "Missing required field: userId",
  "code": "VALIDATION_ERROR"
}
```

**Email delivery failure:**
```json
{
  "error": "Failed to send email notification",
  "code": "EMAIL_ERROR"
}
```

## Use cases

### Send welcome notification to new user
```bash
curl -X POST ${BASE_URL}/api/admin/notifications/send \
  -H "Authorization: Basic <credentials>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "507f1f77bcf86cd799439012",
    "type": "success",
    "title": "Welcome!",
    "message": "Your account has been created successfully",
    "channel": "both"
  }'
```

### Broadcast system maintenance notice
```bash
curl -X POST ${BASE_URL}/api/admin/notifications/broadcast \
  -H "Authorization: Basic <credentials>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "info",
    "title": "Scheduled Maintenance",
    "message": "System maintenance scheduled for tomorrow at 2 AM UTC",
    "channel": "email"
  }'
```

### Fetch user notifications
```bash
curl -X GET ${BASE_URL}/api/notifications \
  -H "Authorization: Bearer <access_token>"
```

## Advanced topics

### Notification channels
- **in_app**: Stored in database only, accessible via API
- **email**: Sent via email provider (requires SMTP configuration)
- **both**: Both in-app and email

### Email status tracking
- `pending` - Email queued for sending
- `sent` - Email successfully sent
- `failed` - Email delivery failed
- `skipped` - Intentionally skipped (e.g., in_app only)

### Activity log integration
Activity logs are automatically created for audit events when `auditMiddleware` is applied to routes. They track:
- User actions (e.g., profile updates, password changes)
- Admin actions (e.g., user deletions, organization updates)
- Changes made to entities
- IP address and user agent

## Integration with audit system

Notifications integrate with the audit log system. When you create notifications, you can reference audit events via metadata:

```javascript
await notificationService.createNotification({
  userId: "507f1f77bcf86cd799439012",
  type: "warning",
  title: "Suspicious activity",
  message: "Multiple failed login attempts detected",
  channel: "both",
  metadata: {
    auditEventId: "507f1f77bcf86cd799439099",
    failedAttempts: 5
  }
});
```
