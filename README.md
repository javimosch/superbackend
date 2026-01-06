# SaasBackend Integration Cheatsheet

## Overview
`saasbackend` (v1.0.6) is a micro SaaS backend package that provides authentication, billing (Stripe), user management, and admin features out of the box.

## Installation

```bash
npm install saasbackend
```

## Environment Variables

Required environment variables in `.env`:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/your-db-name

# JWT Secrets (change in production!)
JWT_ACCESS_SECRET=your-access-secret-change-me
JWT_REFRESH_SECRET=your-refresh-secret-change-me

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Admin Basic Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-in-production

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Public URL for Stripe redirects
PUBLIC_URL=http://localhost:3000
BILLING_RETURN_URL_RELATIVE=/dashboard

# Email (optional - for password reset)
RESEND_API_KEY=your-resend-api-key
```

## Integration Methods

### 1. Middleware Mode (Recommended for existing apps)

```javascript
require('dotenv').config();
const express = require('express');
const saasbackend = require('saasbackend');

const app = express();

// Body parsing (required before saasbackend)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Integrate saasbackend middleware
const saasMiddleware = saasbackend.middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: false, // Disable if handling CORS yourself
  skipBodyParser: true // Skip if you already added body parser
});

app.use(saasMiddleware);

// Your routes here...
```

### 2. Standalone Server Mode

```javascript
const saasbackend = require('saasbackend');

const { app, server } = saasbackend.server({
  port: 3000,
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: '*'
});
```

## API Endpoints

### Authentication Routes (`/api/auth`)

#### Register User
```javascript
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe" // optional
}

Response: 201 Created
{
  "token": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "user": {
    "_id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "subscriptionStatus": "none",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Login
```javascript
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response: 200 OK
{
  "token": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "user": { /* user object */ }
}
```

#### Get Current User
```javascript
GET /api/auth/me
Authorization: Bearer <access_token>

Response: 200 OK
{
  "_id": "user_id",
  "email": "user@example.com",
  "name": "John Doe",
  "subscriptionStatus": "active",
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_...",
  "settings": {},
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### Refresh Token
```javascript
POST /api/auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "jwt_refresh_token"
}

Response: 200 OK
{
  "token": "new_jwt_access_token",
  "refreshToken": "new_jwt_refresh_token"
}
```

### Billing Routes (`/api/billing`) - Requires JWT

#### Create Stripe Checkout Session
```javascript
POST /api/billing/create-checkout-session
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "priceId": "price_1234567890" // Stripe Price ID
}

Response: 200 OK
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}

// Usage:
window.location.href = data.url; // Redirect to Stripe Checkout
```

#### Create Stripe Billing Portal Session
```javascript
POST /api/billing/create-portal-session
Authorization: Bearer <access_token>
Content-Type: application/json

Response: 200 OK
{
  "url": "https://billing.stripe.com/..."
}

// Usage:
window.location.href = data.url; // Redirect to Stripe Billing Portal
```

#### Reconcile Subscription
```javascript
POST /api/billing/reconcile-subscription
Authorization: Bearer <access_token>

Response: 200 OK
{
  "status": "success",
  "subscriptionStatus": "active"
}
```

#### Stripe Webhook Handler
```javascript
POST /api/stripe-webhook
POST /api/stripe/webhook
Content-Type: application/json
Stripe-Signature: <stripe_signature>

// Handled automatically by saasbackend
// Processes: checkout.session.completed, customer.subscription.*,
// invoice.payment_succeeded, invoice.payment_failed
```

### User Management Routes (`/api/user`) - Requires JWT

#### Update Profile
```javascript
PUT /api/user/profile
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "New Name",
  "email": "newemail@example.com" // optional
}

Response: 200 OK
{
  "message": "Profile updated successfully",
  "user": { /* updated user object */ }
}
```

#### Change Password
```javascript
PUT /api/user/password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}

Response: 200 OK
{
  "message": "Password changed successfully"
}
```

#### Request Password Reset
```javascript
POST /api/user/password-reset-request
Content-Type: application/json

{
  "email": "user@example.com"
}

Response: 200 OK
{
  "message": "Password reset email sent"
}
```

#### Confirm Password Reset
```javascript
POST /api/user/password-reset-confirm
Content-Type: application/json

{
  "token": "reset_token_from_email",
  "newPassword": "new_password"
}

Response: 200 OK
{
  "message": "Password reset successfully"
}
```

#### Delete Account
```javascript
DELETE /api/user/account
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "password": "current_password"
}

Response: 200 OK
{
  "message": "Account deleted successfully"
}
```

#### Get User Settings
```javascript
GET /api/user/settings
Authorization: Bearer <access_token>

Response: 200 OK
{
  "settings": { /* user settings object */ }
}
```

#### Update User Settings
```javascript
PUT /api/user/settings
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "theme": "dark",
  "notifications": true,
  "customKey": "customValue"
}

Response: 200 OK
{
  "message": "Settings updated successfully",
  "settings": { /* updated settings */ }
}
```

### Admin Routes (`/api/admin`) - Requires Basic Auth

All admin routes require HTTP Basic Authentication using `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

#### List All Users
```javascript
GET /api/admin/users
Authorization: Basic <base64(username:password)>

Response: 200 OK
{
  "users": [ /* array of user objects */ ],
  "total": 42
}
```

#### Get User by ID
```javascript
GET /api/admin/users/:id
Authorization: Basic <base64(username:password)>

Response: 200 OK
{
  "user": { /* user object */ }
}
```

#### Update User Subscription
```javascript
PUT /api/admin/users/:id/subscription
Authorization: Basic <base64(username:password)>
Content-Type: application/json

{
  "subscriptionStatus": "active",
  "stripeSubscriptionId": "sub_...",
  "stripeCustomerId": "cus_..."
}

Response: 200 OK
{
  "message": "Subscription updated successfully",
  "user": { /* updated user object */ }
}
```

#### Reconcile User Subscription
```javascript
POST /api/admin/users/:id/reconcile
Authorization: Basic <base64(username:password)>

Response: 200 OK
{
  "status": "success",
  "message": "Subscription reconciled"
}
```

#### Generate Test JWT Token
```javascript
POST /api/admin/generate-token
Authorization: Basic <base64(username:password)>
Content-Type: application/json

{
  "userId": "user_id"
}

Response: 200 OK
{
  "token": "jwt_access_token",
  "refreshToken": "jwt_refresh_token"
}
```

#### List Stripe Webhook Events
```javascript
GET /api/admin/stripe-webhooks
Authorization: Basic <base64(username:password)>

Response: 200 OK
{
  "events": [ /* array of webhook events */ ]
}
```

#### Get Stripe Webhook Event
```javascript
GET /api/admin/stripe-webhooks/:id
Authorization: Basic <base64(username:password)>

Response: 200 OK
{
  "event": { /* webhook event object */ }
}
```

### Global Settings Routes

#### Get All Settings (Admin)
```javascript
GET /api/admin/settings
Authorization: Basic <base64(username:password)>

Response: 200 OK
{
  "settings": [ /* array of settings */ ]
}
```

#### Get Public Settings (No Auth)
```javascript
GET /api/settings/public

Response: 200 OK
{
  "settings": [ /* public settings only */ ]
}
```

### Notification Routes (`/api`) - Requires JWT

#### Get User Notifications
```javascript
GET /api/notifications
Authorization: Bearer <access_token>

Response: 200 OK
{
  "notifications": [
    {
      "_id": "notif_id",
      "userId": "user_id",
      "type": "info",
      "title": "Welcome!",
      "message": "Thanks for signing up",
      "read": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Mark Notification as Read
```javascript
PUT /api/notifications/:id/read
Authorization: Bearer <access_token>

Response: 200 OK
{
  "message": "Notification marked as read"
}
```

#### Get Activity Log
```javascript
GET /api/activity-log
Authorization: Bearer <access_token>

Response: 200 OK
{
  "logs": [
    {
      "_id": "log_id",
      "userId": "user_id",
      "action": "login",
      "details": {},
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Create Activity Log Entry
```javascript
POST /api/activity-log
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "action": "profile_updated",
  "details": { "field": "name" }
}

Response: 201 Created
{
  "message": "Activity logged",
  "log": { /* log object */ }
}
```

## Frontend Integration Examples

### Login Example
```javascript
async function login(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  
  if (response.ok) {
    localStorage.setItem('accessToken', data.token);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.user;
  } else {
    throw new Error(data.error);
  }
}
```

### Authenticated API Call Example
```javascript
async function getCurrentUser() {
  const token = localStorage.getItem('accessToken');
  
  const response = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (response.ok) {
    return await response.json();
  } else if (response.status === 401) {
    // Try to refresh token
    await refreshToken();
    return getCurrentUser(); // Retry
  } else {
    throw new Error('Failed to get user');
  }
}
```

### Token Refresh Example
```javascript
async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  const response = await fetch('/api/auth/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  if (response.ok) {
    const data = await response.json();
    localStorage.setItem('accessToken', data.token);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    return data.token;
  } else {
    // Refresh failed, redirect to login
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
}
```

### Stripe Checkout Example
```javascript
async function createCheckoutSession(priceId) {
  const token = localStorage.getItem('accessToken');
  
  const response = await fetch('/api/billing/create-checkout-session', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ priceId })
  });
  
  const data = await response.json();
  
  if (response.ok) {
    // Redirect to Stripe Checkout
    window.location.href = data.url;
  } else {
    throw new Error(data.error);
  }
}
```

### Stripe Billing Portal Example
```javascript
async function openBillingPortal() {
  const token = localStorage.getItem('accessToken');
  
  const response = await fetch('/api/billing/create-portal-session', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (response.ok) {
    // Redirect to Stripe Billing Portal
    window.location.href = data.url;
  } else {
    throw new Error(data.error || 'Failed to open billing portal');
  }
}
```

## Database Schema

### User Model
```javascript
{
  _id: ObjectId,
  email: String (unique, required),
  passwordHash: String (required),
  name: String,
  subscriptionStatus: 'none' | 'active' | 'cancelled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid',
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  settings: Object (Mixed),
  passwordResetToken: String,
  passwordResetExpiry: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Notification Model
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  type: String,
  title: String,
  message: String,
  read: Boolean,
  createdAt: Date
}
```

### StripeWebhookEvent Model
```javascript
{
  _id: ObjectId,
  stripeEventId: String (unique),
  eventType: String,
  data: Object (Mixed),
  previousAttributes: Object,
  status: 'received' | 'processed' | 'failed',
  retryCount: Number,
  processingErrors: Array,
  processedAt: Date,
  createdAt: Date
}
```

### ActivityLog Model
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  action: String,
  details: Object (Mixed),
  createdAt: Date
}
```

### GlobalSetting Model
```javascript
{
  _id: ObjectId,
  key: String (unique),
  value: Mixed,
  type: String,
  isPublic: Boolean,
  description: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Stripe Webhook Events Handled

- `checkout.session.completed` - Creates/updates subscription after successful checkout
- `customer.subscription.created` - Records new subscription
- `customer.subscription.updated` - Updates subscription status
- `customer.subscription.deleted` - Marks subscription as cancelled
- `invoice.payment_succeeded` - Records successful payment
- `invoice.payment_failed` - Records failed payment

## Admin UI

Access admin testing interface at:
- `/admin/test` - API Testing Interface (Basic Auth required)
- `/admin/global-settings` - Global Settings Manager (Basic Auth required)

## JWT Token Lifecycle

1. **Access Token**: Expires in 15 minutes
2. **Refresh Token**: Expires in 7 days
3. When access token expires, use refresh token to get new access token
4. When both expire, user must login again

## Common Issues & Solutions

### 401 Unauthorized on `/api/auth/me`
- Ensure `JWT_ACCESS_SECRET` matches between registration and validation
- Check that token is being sent in `Authorization: Bearer <token>` header
- Verify token is stored correctly after login/register (API returns `token`, not `accessToken`)

### Stripe Webhook Not Working
- Verify `STRIPE_WEBHOOK_SECRET` is set correctly
- Test webhook locally using Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Check webhook events in Stripe Dashboard
- Verify raw body parser is used for webhook route (already handled by saasbackend)

### CORS Issues
- Set `CORS_ORIGIN` in .env to your frontend URL
- Or set `corsOrigin: false` in middleware and handle CORS yourself

### MongoDB Connection Issues
- Ensure `MONGODB_URI` is correct
- Check MongoDB is running
- Verify network connectivity

## Best Practices

1. **Always use HTTPS in production** for secure token transmission
2. **Change default JWT secrets** before deploying
3. **Set up Stripe webhooks** for production environment
4. **Implement rate limiting** on auth endpoints
5. **Store tokens securely** (httpOnly cookies preferred over localStorage for production)
6. **Validate Stripe webhook signatures** (already done by saasbackend)
7. **Monitor webhook event processing** using admin endpoints
8. **Implement proper error handling** for all API calls
9. **Use environment variables** for all sensitive data
10. **Test subscription flows** in Stripe test mode before going live

## Links

- GitHub: [saasbackend package](https://www.npmjs.com/package/saasbackend)
- Stripe Documentation: https://stripe.com/docs
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
