# User Settings & Profile Management

## What it is

A comprehensive user account management system covering:
- Profile information (name, email, avatar, etc.)
- Password management (change password, reset password)
- Account deletion
- User preferences and settings

Each action is tracked in the audit log for security and compliance.

## Base URL / mount prefix

When mounted at `/saas`, all routes are prefixed:
- `/saas/api/user/*`

In this document we use `${BASE_URL}` which should include the mount prefix.

## Configuration

### Environment variables

- `JWT_SECRET`
  - Required
  - Used for password reset token generation
- `PASSWORD_MIN_LENGTH`
  - Optional
  - Default: `8`
  - Minimum password length
- `PASSWORD_RESET_TOKEN_EXPIRY`
  - Optional
  - Default: `3600` (1 hour in seconds)

## API

### Authentication context

These endpoints fall into two categories:
- **JWT authenticated** - User accessing their own account
- **Public** - Password reset flow without authentication

### User endpoints (JWT authentication required)

#### Update profile
```
PUT ${BASE_URL}/api/user/profile
```

**Authentication:** Required (Bearer token)

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "avatar": "https://example.com/avatar.jpg",
  "bio": "Optional bio text",
  "phone": "Optional phone number"
}
```

**Response:**
```json
{
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "avatar": "https://example.com/avatar.jpg",
    "bio": "Optional bio text",
    "phone": "Optional phone number",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Audit event:** `user.profile.update`

#### Change password
```
PUT ${BASE_URL}/api/user/password
```

**Authentication:** Required

**Body:**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456",
  "confirmPassword": "newPassword456"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
}
```

**Audit event:** `user.password.change`

**Validation rules:**
- New password must be different from current password
- New password must be at least `PASSWORD_MIN_LENGTH` characters
- New and confirm password must match

#### Get user settings
```
GET ${BASE_URL}/api/user/settings
```

**Authentication:** Required

**Response:**
```json
{
  "settings": {
    "userId": "507f1f77bcf86cd799439011",
    "emailNotifications": true,
    "twoFactorEnabled": false,
    "language": "en",
    "timezone": "UTC",
    "theme": "light",
    "notifications": {
      "marketing": false,
      "security": true,
      "updates": true
    }
  }
}
```

#### Update user settings
```
PUT ${BASE_URL}/api/user/settings
```

**Authentication:** Required

**Body:**
```json
{
  "emailNotifications": true,
  "twoFactorEnabled": false,
  "language": "en",
  "timezone": "America/New_York",
  "theme": "dark",
  "notifications": {
    "marketing": false,
    "security": true,
    "updates": true
  }
}
```

**Response:**
```json
{
  "settings": {
    "userId": "507f1f77bcf86cd799439011",
    "emailNotifications": true,
    "language": "en",
    "timezone": "America/New_York",
    "theme": "dark",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Audit event:** `user.settings.update`

#### Delete account
```
DELETE ${BASE_URL}/api/user/account
```

**Authentication:** Required

**Body:**
```json
{
  "password": "currentPassword123",
  "confirm": "DELETE"
}
```

**Response:**
```json
{
  "message": "Account deleted successfully"
}
```

**Audit event:** `user.account.delete`

**Warning:** This action is irreversible. All user data, notifications, and organization memberships will be deleted.

### Public endpoints (no authentication)

#### Request password reset
```
POST ${BASE_URL}/api/user/password-reset-request
```

**Authentication:** Not required

**Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If an account exists with this email, a reset link has been sent"
}
```

**Behavior:**
- Always returns the same message (security - doesn't reveal if email exists)
- If account exists, sends email with reset token and link
- Reset token expires in `PASSWORD_RESET_TOKEN_EXPIRY` seconds
- Multiple reset requests can be made; only the latest token is valid

**Audit event:** `user.password_reset.request`

#### Confirm password reset
```
POST ${BASE_URL}/api/user/password-reset-confirm
```

**Authentication:** Not required

**Body:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "newPassword456",
  "confirmPassword": "newPassword456"
}
```

**Response:**
```json
{
  "message": "Password reset successfully",
  "token": "new_access_token"
}
```

**Response on error:**
```json
{
  "error": "Invalid or expired reset token",
  "code": "INVALID_TOKEN"
}
```

**Audit event:** `user.password_reset.confirm`

**Validation rules:**
- Token must be valid and not expired
- New password must be at least `PASSWORD_MIN_LENGTH` characters
- Passwords must match

## Common errors / troubleshooting

### 401 Unauthorized
- Missing or invalid JWT token
- Token has expired

**Response:**
```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```

### 400 Validation error
- Missing required fields
- Invalid field format
- Passwords don't match

**Response:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "password": "Passwords do not match"
  }
}
```

### 400 Invalid credentials
- Current password is incorrect when changing password

**Response:**
```json
{
  "error": "Invalid current password",
  "code": "INVALID_CREDENTIALS"
}
```

### 400 Password requirements
- New password is too short
- New password is same as current password

**Response:**
```json
{
  "error": "Password does not meet requirements",
  "code": "PASSWORD_REQUIREMENTS",
  "details": {
    "minLength": 8
  }
}
```

### 404 User not found
- User no longer exists (rare edge case)

**Response:**
```json
{
  "error": "User not found",
  "code": "NOT_FOUND"
}
```

## Use cases

### Update user profile
```bash
curl -X PUT ${BASE_URL}/api/user/profile \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "bio": "Software engineer"
  }'
```

### Change password
```bash
curl -X PUT ${BASE_URL}/api/user/password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "oldPassword123",
    "newPassword": "newPassword456",
    "confirmPassword": "newPassword456"
  }'
```

### Request password reset
```bash
curl -X POST ${BASE_URL}/api/user/password-reset-request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

### Confirm password reset
```bash
curl -X POST ${BASE_URL}/api/user/password-reset-confirm \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGc...",
    "newPassword": "newPassword456",
    "confirmPassword": "newPassword456"
  }'
```

### Get user settings
```bash
curl -X GET ${BASE_URL}/api/user/settings \
  -H "Authorization: Bearer <access_token>"
```

### Update user settings
```bash
curl -X PUT ${BASE_URL}/api/user/settings \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "fr",
    "timezone": "Europe/Paris",
    "theme": "dark",
    "notifications": {
      "marketing": false,
      "security": true,
      "updates": true
    }
  }'
```

## Advanced topics

### Password reset flow

The password reset flow is designed for forgotten passwords:

1. User requests reset via email: `POST /user/password-reset-request`
2. Backend generates secure token and sends via email
3. User clicks link in email and submits new password: `POST /user/password-reset-confirm`
4. Password is updated and user receives new access token
5. User can immediately log in with new password

### Account deletion

Account deletion is permanent and performs:
- Deletion of user record
- Deletion of all user notifications
- Removal from all organizations
- Deletion of user-specific settings
- Audit log entry

### Settings inheritance

User settings can override global settings:
- Global default language/timezone applies if user hasn't set preference
- User settings take precedence over global defaults in the application layer

### Password requirements

Enforce strong passwords:
- Minimum length (configurable, default 8)
- Should contain mix of character types (enforced client-side in UI)
- Cannot reuse recent passwords (implement in production)
- Cannot be same as username or email (validate in implementation)

### Audit trail

All user account changes are logged:
- Profile updates include old and new values
- Password changes only log that change occurred (never logs actual passwords)
- Settings updates track which settings were changed
- Account deletion is logged with user ID for recovery purposes

### Email verification

For email changes (if implemented):
- Send verification email to new email address
- User must confirm before email is updated
- Old email remains active until confirmed
- Prevents accidental lockouts
