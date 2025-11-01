# API Endpoints Cheatsheet

## Table of Contents
1. [Overview](#overview)
2. [Existing Endpoints](#existing-endpoints)
3. [How to Add New Endpoints](#how-to-add-new-endpoints)
4. [How to Add to Admin Testing UI](#how-to-add-to-admin-testing-ui)
5. [Best Practices](#best-practices)

---

## Overview

NoteSyncer uses a standard MVC architecture with Express.js:
- **Models**: Mongoose schemas in `/src/models/`
- **Controllers**: Business logic in `/src/controllers/`
- **Routes**: Route definitions in `/src/routes/`
- **Middleware**: Authentication in `/src/middleware/`
- **Services**: Shared services in `/src/services/`

---

## Existing Endpoints

### Authentication (4 endpoints)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh-token` - Refresh JWT
- `GET /api/auth/me` - Get current user (JWT)

### Billing (3 endpoints)
- `POST /api/billing/create-checkout-session` - Create Stripe checkout (JWT)
- `POST /api/billing/create-portal-session` - Create billing portal (JWT)
- `POST /api/billing/reconcile-subscription` - Reconcile subscription (JWT)

### Admin (7 endpoints)
- `GET /api/admin/users` - List users (Basic Auth)
- `GET /api/admin/users/:id` - Get user (Basic Auth)
- `PUT /api/admin/users/:id/subscription` - Update subscription (Basic Auth)
- `POST /api/admin/users/:id/reconcile` - Reconcile user (Basic Auth)
- `POST /api/admin/generate-token` - Generate JWT for testing (Basic Auth)
- `GET /api/admin/stripe-webhooks` - List webhook events (Basic Auth)
- `GET /api/admin/stripe-webhooks/:id` - Get webhook event (Basic Auth)

### Notifications & Activity (4 endpoints)
- `GET /api/notifications` - Get user notifications (JWT)
- `PUT /api/notifications/:id/read` - Mark notification as read (JWT)
- `GET /api/activity-log` - Get user activity log (JWT)
- `POST /api/activity-log` - Create activity log entry (JWT)

### User Management (7 endpoints)
- `PUT /api/user/profile` - Update user profile (JWT)
- `PUT /api/user/password` - Change password (JWT)
- `POST /api/user/password-reset-request` - Request password reset (Public)
- `POST /api/user/password-reset-confirm` - Confirm password reset (Public)
- `DELETE /api/user/account` - Delete account (JWT)
- `GET /api/user/settings` - Get user settings (JWT)
- `PUT /api/user/settings` - Update user settings (JWT)

### Global Settings (6 endpoints)
- `GET /api/admin/settings` - Get all settings (Basic Auth)
- `GET /api/admin/settings/:key` - Get specific setting (Basic Auth)
- `PUT /api/admin/settings/:key` - Update setting (Basic Auth)
- `POST /api/admin/settings` - Create new setting (Basic Auth)
- `DELETE /api/admin/settings/:key` - Delete setting (Basic Auth)
- `GET /api/admin/settings/public` - Get public settings (Public)

### Webhooks (2 endpoints)
- `POST /api/stripe-webhook` - Stripe webhook (legacy)
- `POST /api/stripe/webhook` - Stripe webhook

**Total: 37 endpoints**

---

## Existing Systems

### Activity Logging System
- Automatic logging for user actions
- Model: `ActivityLog.js`
- Categories: auth, billing, content, settings, admin, other
- Includes IP address, user agent, and metadata

### Email System
- Service: `/src/services/email.service.js`
- Uses Resend API (with simulation fallback)
- Template variable replacement ({{variableName}})
- Database-backed settings integration
- Email types: password reset, password changed, account deletion

### Global Settings System
- Database-backed configuration
- Template support with variables
- Public/private flag
- Type validation (string, html, boolean, json, number)
- Caching (1-minute TTL)

### CORS Configuration
- Default: Allow all origins (`*`)
- Customizable via `CORS_ORIGIN` environment variable
- Supports single origin or comma-separated list
- Examples:
  - `CORS_ORIGIN=*` (allow all)
  - `CORS_ORIGIN=http://localhost:3000` (single)
  - `CORS_ORIGIN=http://localhost:3000,https://app.notesyncer.com` (multiple)

---

## How to Add New Endpoints

### Step 1: Create/Update the Model

Create or update a Mongoose model in `/src/models/`:

```javascript
// src/models/Example.js
const mongoose = require('mongoose');

const exampleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Add indexes for frequently queried fields
exampleSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Example', exampleSchema);
```

### Step 2: Create the Controller

Create controller functions in `/src/controllers/`:

```javascript
// src/controllers/example.controller.js
const Example = require('../models/Example');

// GET /api/examples
exports.getExamples = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const examples = await Example.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();
    
    const total = await Example.countDocuments({ userId: req.user._id });
    
    res.json({
      examples,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching examples:', error);
    res.status(500).json({ error: 'Failed to fetch examples' });
  }
};

// POST /api/examples
exports.createExample = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const example = await Example.create({
      userId: req.user._id,
      name,
      description
    });
    
    res.status(201).json({
      message: 'Example created successfully',
      example
    });
  } catch (error) {
    console.error('Error creating example:', error);
    res.status(500).json({ error: 'Failed to create example' });
  }
};

// PUT /api/examples/:id
exports.updateExample = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    
    const example = await Example.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { name, description, status },
      { new: true, runValidators: true }
    );
    
    if (!example) {
      return res.status(404).json({ error: 'Example not found' });
    }
    
    res.json({
      message: 'Example updated successfully',
      example
    });
  } catch (error) {
    console.error('Error updating example:', error);
    res.status(500).json({ error: 'Failed to update example' });
  }
};

// DELETE /api/examples/:id
exports.deleteExample = async (req, res) => {
  try {
    const { id } = req.params;
    
    const example = await Example.findOneAndDelete({
      _id: id,
      userId: req.user._id
    });
    
    if (!example) {
      return res.status(404).json({ error: 'Example not found' });
    }
    
    res.json({ message: 'Example deleted successfully' });
  } catch (error) {
    console.error('Error deleting example:', error);
    res.status(500).json({ error: 'Failed to delete example' });
  }
};
```

### Step 3: Create the Routes

Define routes in `/src/routes/`:

```javascript
// src/routes/example.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const exampleController = require('../controllers/example.controller');

// All routes require JWT authentication
router.get('/', authenticate, exampleController.getExamples);
router.post('/', authenticate, exampleController.createExample);
router.put('/:id', authenticate, exampleController.updateExample);
router.delete('/:id', authenticate, exampleController.deleteExample);

module.exports = router;
```

**For Basic Auth (admin endpoints):**
```javascript
const { basicAuth } = require('../middleware/auth');

router.get('/admin/examples', basicAuth, exampleController.getAdminExamples);
```

**For Public endpoints (no auth):**
```javascript
router.get('/public/examples', exampleController.getPublicExamples);
```

### Step 4: Register Routes in Server

Add routes to `server.js`:

```javascript
// API Routes
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/billing', require('./src/routes/billing.routes'));
app.use('/api/examples', require('./src/routes/example.routes')); // Add here
// ... other routes
```

### Step 5: Add to Startup Logs

Update the endpoint list in `server.js`:

```javascript
console.log('📋 API Endpoints:');
// ... existing endpoints
console.log('  GET  /api/examples - List examples (JWT)');
console.log('  POST /api/examples - Create example (JWT)');
console.log('  PUT  /api/examples/:id - Update example (JWT)');
console.log('  DELETE /api/examples/:id - Delete example (JWT)');
```

### Step 6: (Optional) Add Activity Logging

If the endpoint should log user activity:

```javascript
const ActivityLog = require('../models/ActivityLog');

// Helper function
const logActivity = async (userId, action, category, description, metadata, req) => {
  try {
    await ActivityLog.create({
      userId,
      action,
      category,
      description,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      metadata
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

// In your controller
exports.createExample = async (req, res) => {
  try {
    // ... create example
    
    // Log activity
    await logActivity(
      req.user._id,
      'create_example',
      'content',
      'User created a new example',
      { exampleId: example._id, name: example.name },
      req
    );
    
    res.status(201).json({ example });
  } catch (error) {
    // ... error handling
  }
};
```

---

## How to Add to Admin Testing UI

The admin testing UI is located at `/views/admin-test.ejs`.

### Step 1: Add to Sidebar Navigation

Find the sidebar section and add a button:

```html
<!-- In the left sidebar -->
<div class="mb-4">
  <h2 class="text-sm font-semibold text-gray-400 mb-2">Examples</h2>
  <button onclick="showEndpoint('examples-list')" class="w-full text-left px-4 py-2 rounded hover:bg-gray-700 transition">
    GET /api/examples
  </button>
  <button onclick="showEndpoint('examples-create')" class="w-full text-left px-4 py-2 rounded hover:bg-gray-700 transition">
    POST /api/examples
  </button>
  <button onclick="showEndpoint('examples-update')" class="w-full text-left px-4 py-2 rounded hover:bg-gray-700 transition">
    PUT /api/examples/:id
  </button>
  <button onclick="showEndpoint('examples-delete')" class="w-full text-left px-4 py-2 rounded hover:bg-gray-700 transition">
    DELETE /api/examples/:id
  </button>
</div>
```

### Step 2: Add Form Definitions

In the `forms` object in the JavaScript section:

```javascript
const forms = {
  // ... existing forms
  
  'examples-list': `
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-2xl font-bold mb-4">GET /api/examples</h2>
      <div class="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
        <p class="text-sm">⚠️ This endpoint requires JWT authentication</p>
      </div>
      <p class="text-gray-600 mb-4">Retrieve user's examples with pagination</p>
      <form onsubmit="event.preventDefault(); 
        const limit = document.getElementById('ex-limit').value;
        const offset = document.getElementById('ex-offset').value;
        let url = '/api/examples?';
        if (limit) url += 'limit=' + limit + '&';
        if (offset) url += 'offset=' + offset;
        makeRequest(url, 'GET', null, true)
      ">
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">JWT Token</label>
          <textarea id="jwt-input" class="w-full border rounded px-3 py-2" rows="4" required></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium mb-2">Limit</label>
            <input type="number" id="ex-limit" class="w-full border rounded px-3 py-2" placeholder="50" value="50">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Offset</label>
            <input type="number" id="ex-offset" class="w-full border rounded px-3 py-2" placeholder="0" value="0">
          </div>
        </div>
        <button type="submit" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Get Examples</button>
      </form>
      <div class="mt-6">
        <h3 class="font-semibold mb-2">Response:</h3>
        <pre id="response" class="bg-gray-100 p-4 rounded overflow-auto max-h-96"></pre>
      </div>
    </div>
  `,
  
  'examples-create': `
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-2xl font-bold mb-4">POST /api/examples</h2>
      <div class="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
        <p class="text-sm">⚠️ This endpoint requires JWT authentication</p>
      </div>
      <p class="text-gray-600 mb-4">Create a new example</p>
      <form onsubmit="event.preventDefault(); makeRequest('/api/examples', 'POST', {
        name: document.getElementById('ex-name').value,
        description: document.getElementById('ex-description').value
      }, true)">
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">JWT Token</label>
          <textarea id="jwt-input" class="w-full border rounded px-3 py-2" rows="4" required></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Name *</label>
          <input type="text" id="ex-name" class="w-full border rounded px-3 py-2" required>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Description</label>
          <textarea id="ex-description" class="w-full border rounded px-3 py-2" rows="3"></textarea>
        </div>
        <button type="submit" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">Create Example</button>
      </form>
      <div class="mt-6">
        <h3 class="font-semibold mb-2">Response:</h3>
        <pre id="response" class="bg-gray-100 p-4 rounded overflow-auto max-h-96"></pre>
      </div>
    </div>
  `,
  
  'examples-update': `
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-2xl font-bold mb-4">PUT /api/examples/:id</h2>
      <div class="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
        <p class="text-sm">⚠️ This endpoint requires JWT authentication</p>
      </div>
      <p class="text-gray-600 mb-4">Update an existing example</p>
      <form onsubmit="event.preventDefault(); makeRequest('/api/examples/' + document.getElementById('ex-update-id').value, 'PUT', {
        name: document.getElementById('ex-update-name').value,
        description: document.getElementById('ex-update-description').value,
        status: document.getElementById('ex-update-status').value
      }, true)">
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">JWT Token</label>
          <textarea id="jwt-input" class="w-full border rounded px-3 py-2" rows="4" required></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Example ID *</label>
          <input type="text" id="ex-update-id" class="w-full border rounded px-3 py-2" required>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Name</label>
          <input type="text" id="ex-update-name" class="w-full border rounded px-3 py-2">
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Description</label>
          <textarea id="ex-update-description" class="w-full border rounded px-3 py-2" rows="3"></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Status</label>
          <select id="ex-update-status" class="w-full border rounded px-3 py-2">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button type="submit" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Update Example</button>
      </form>
      <div class="mt-6">
        <h3 class="font-semibold mb-2">Response:</h3>
        <pre id="response" class="bg-gray-100 p-4 rounded overflow-auto max-h-96"></pre>
      </div>
    </div>
  `,
  
  'examples-delete': `
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-2xl font-bold mb-4">DELETE /api/examples/:id</h2>
      <div class="bg-red-100 border-l-4 border-red-500 p-4 mb-4">
        <p class="text-sm">⚠️ This endpoint requires JWT authentication</p>
        <p class="text-sm mt-2"><strong>Warning:</strong> This action cannot be undone!</p>
      </div>
      <p class="text-gray-600 mb-4">Delete an example</p>
      <form onsubmit="event.preventDefault(); 
        if (!confirm('Are you sure you want to delete this example?')) return;
        makeRequest('/api/examples/' + document.getElementById('ex-delete-id').value, 'DELETE', null, true)
      ">
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">JWT Token</label>
          <textarea id="jwt-input" class="w-full border rounded px-3 py-2" rows="4" required></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Example ID *</label>
          <input type="text" id="ex-delete-id" class="w-full border rounded px-3 py-2" required>
        </div>
        <button type="submit" class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Delete Example</button>
      </form>
      <div class="mt-6">
        <h3 class="font-semibold mb-2">Response:</h3>
        <pre id="response" class="bg-gray-100 p-4 rounded overflow-auto max-h-96"></pre>
      </div>
    </div>
  `
};
```

### UI Color Conventions

- **Yellow border** (`bg-yellow-100 border-yellow-500`): JWT authentication required
- **Blue border** (`bg-blue-100 border-blue-500`): Basic Auth or informational
- **Green border** (`bg-green-100 border-green-500`): Public endpoint (no auth)
- **Red border** (`bg-red-100 border-red-500`): Destructive action (delete)

### Button Colors

- **Blue** (`bg-blue-500`): Standard GET/PUT operations
- **Green** (`bg-green-500`): POST/Create operations
- **Red** (`bg-red-500`): DELETE operations
- **Gray** (`bg-gray-500`): Cancel/Secondary actions

---

## Best Practices

### 1. Error Handling
Always wrap async operations in try-catch:
```javascript
try {
  // your code
} catch (error) {
  console.error('Detailed error message:', error);
  res.status(500).json({ error: 'User-friendly error message' });
}
```

### 2. Input Validation
Validate all user inputs:
```javascript
if (!name || name.trim().length === 0) {
  return res.status(400).json({ error: 'Name is required' });
}

if (email && !isValidEmail(email)) {
  return res.status(400).json({ error: 'Invalid email format' });
}
```

### 3. Pagination
Always implement pagination for list endpoints:
```javascript
const { limit = 50, offset = 0 } = req.query;

const items = await Model.find(query)
  .limit(parseInt(limit))
  .skip(parseInt(offset));

const total = await Model.countDocuments(query);

res.json({
  items,
  pagination: {
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
    hasMore: total > parseInt(offset) + parseInt(limit)
  }
});
```

### 4. Security
- **Never** return sensitive data (passwords, tokens) in responses
- **Always** verify ownership (userId match) before allowing operations
- Use JWT for user endpoints, Basic Auth for admin endpoints
- Sanitize HTML inputs to prevent XSS

```javascript
// Verify ownership
const item = await Model.findOne({ 
  _id: id, 
  userId: req.user._id  // Only allow user's own items
});

if (!item) {
  return res.status(404).json({ error: 'Not found' });
}
```

### 5. Response Format
Use consistent response formats:

**Success:**
```javascript
res.json({
  message: 'Operation successful',
  data: result
});
```

**Error:**
```javascript
res.status(400).json({
  error: 'User-friendly error message'
});
```

**List with Pagination:**
```javascript
res.json({
  items: results,
  pagination: {
    total,
    limit,
    offset,
    hasMore
  }
});
```

### 6. Database Queries
- Use `.lean()` for read-only queries (better performance)
- Add indexes for frequently queried fields
- Use projections to limit returned fields

```javascript
// Good: Fast, returns plain objects
const users = await User.find().select('name email').lean();

// Better: With index
userSchema.index({ email: 1, status: 1 });
```

### 7. Logging
Log important operations:
```javascript
console.log(`User ${req.user._id} created example ${example._id}`);
console.error('Database connection failed:', error);
```

### 8. Testing
Test your endpoints using the admin UI:
1. Access `/admin/test` (Basic Auth required)
2. Select your endpoint from the sidebar
3. Fill in the form and test different scenarios
4. Check the response in the output area

---

## Quick Reference

### Authentication Methods

| Method | Usage | Example |
|--------|-------|---------|
| JWT | User endpoints | `router.get('/', authenticate, controller.method)` |
| Basic Auth | Admin endpoints | `router.get('/', basicAuth, controller.method)` |
| Public | No auth | `router.get('/', controller.method)` |

### HTTP Status Codes

| Code | Meaning | Use Case |
|------|---------|----------|
| 200 | OK | Successful GET/PUT/DELETE |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE (no body) |
| 400 | Bad Request | Validation error |
| 401 | Unauthorized | Invalid/missing auth |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 500 | Server Error | Internal server error |

### Common Query Parameters

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `limit` | Pagination limit | `?limit=50` |
| `offset` | Pagination offset | `?offset=100` |
| `sort` | Sort field | `?sort=createdAt` |
| `order` | Sort order | `?order=desc` |
| `filter` | Filter criteria | `?filter=active` |
| `search` | Search query | `?search=test` |

---

## Additional Resources

- **Mongoose Documentation**: https://mongoosejs.com/docs/
- **Express.js Documentation**: https://expressjs.com/
- **JWT Best Practices**: https://jwt.io/introduction
- **CORS Configuration**: https://github.com/expressjs/cors#readme

---

## Need Help?

If you encounter issues:
1. Check the server logs for detailed error messages
2. Use the admin testing UI to test endpoints
3. Verify authentication tokens are valid
4. Check database indexes for performance issues
5. Review existing endpoints for patterns and examples

Happy coding! 🚀
