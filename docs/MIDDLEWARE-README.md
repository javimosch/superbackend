# Middleware Mode - Quick Start Guide

This SaaS backend can be used in two ways:

## 1. Standalone Server Mode (Default)

Run the full application with landing page:

```bash
npm start
# or
node server.js
```

## 2. Middleware Mode (Integration)

Integrate the backend into your existing Express.js application:

```javascript
const express = require('express');
const { middleware } = require('./index'); // or 'notesyncer-landing' from npm

const app = express();

// Your app's routes
app.get('/', (req, res) => {
  res.send('My App Home');
});

// Mount SaaS backend at /saas
app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,  // Optional
  corsOrigin: '*'  // Optional
}));

app.listen(3000);
```

### Available Options

```javascript
middleware({
  // Optional: MongoDB connection string
  mongodbUri: 'mongodb://localhost:27017/mydb',
  
  // Optional: CORS origin(s) - supports '*', single origin, or comma-separated
  corsOrigin: 'https://example.com',
  
  // Optional: Existing Mongoose connection (alternative to mongodbUri)
  // dbConnection: mongoose.connection
})
```

### Exposed Routes

When mounted at `/saas`, all routes are prefixed:

**API Routes:**
- `POST /saas/api/auth/register` - Register user
- `POST /saas/api/auth/login` - Login user  
- `GET /saas/api/auth/me` - Get current user (JWT)
- `POST /saas/api/billing/create-checkout-session` - Create Stripe checkout
- `GET /saas/api/notifications` - Get notifications (JWT)
- `PUT /saas/api/user/profile` - Update profile (JWT)
- And more... (see endpoints-cheatsheet.md)

**Admin Routes:**
- `GET /saas/admin/test` - API testing UI (Basic Auth)
- `GET /saas/admin/global-settings` - Settings manager (Basic Auth)

**Static Assets:**
- `/saas/admin/assets/*` - CSS, JS, images for admin views

**Health Check:**
- `GET /saas/health` - Health status and mode information

### Environment Variables

Set these in your parent application's environment:

```bash
MONGODB_URI=mongodb://localhost:27017/mydb
JWT_SECRET=your-jwt-secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=secret
CORS_ORIGIN=https://example.com
```

### Key Features

- ✅ No view engine conflicts - admin views are rendered independently
- ✅ Isolated static asset serving under `/admin/assets`
- ✅ Can reuse parent app's database connection
- ✅ Configurable CORS per instance
- ✅ All API endpoints and admin UI preserved
- ✅ Clean Express Router pattern

### Examples

See these files for working examples:
- `example-middleware-usage.js` - Basic integration example
- `test-middleware.js` - Testing/validation example
- `docs/middleware-mode.md` - Detailed documentation

### Testing

Test the middleware mode:

```bash
PORT=4500 node test-middleware.js
```

Then visit:
- http://localhost:4500/ (parent app)
- http://localhost:4500/saas/health (backend health)
- http://localhost:4500/saas/admin/test (admin UI)

### Validation

Verify both modes are properly exported:

```bash
node validate-modes.js
```
