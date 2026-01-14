# Middleware Mode for SaaS Backend

This document outlines the plan to enable a middleware mode for the SaaS backend application. In this mode, the application will function as an Express.js middleware, allowing it to be integrated into an existing Node.js application. This mode will primarily expose the API endpoints and admin views, omitting the standalone landing page.

## Goals

1.  **Enable Middleware Integration:** Allow the SaaS backend to be mounted as a sub-application within another Express.js application.
2.  **Isolate Functionality:** In middleware mode, only expose the API routes and admin-related views/functionality.
3.  **Avoid Route Conflicts:** Ensure the middleware does not interfere with the parent application's routes, especially the root route (`/`).
4.  **Manage Static Assets:** Handle static assets for admin views in a way that prevents conflicts with the parent application's static files.
5.  **Clear Documentation:** Provide clear instructions on how to configure and use the middleware mode.

## Proposed Changes

### 1. `@intranefr/superbackend` NPM Package Structure

The application will be published as an npm package named `@intranefr/superbackend`. This package will expose two primary ways to use the backend:

*   **Standalone Server:** A function to start the full SaaS backend application, including the landing page and its own static asset serving.
*   **Express Middleware:** A function that returns an `express.Router()` instance, exposing only the API routes and admin views, suitable for mounting within another Express.js application.

### 2. Package Entry Points

The `package.json` `main` entry will point to a file (e.g., `index.js`) that exports these two functionalities.

*   **`@intranefr/superbackend.server(options)`:** A function that initializes and starts the standalone server. `options` can include configuration like port, database connection, etc.
*   **`@intranefr/superbackend.middleware(options)`:** A function that returns an `express.Router()` instance. `options` can include configuration like database connection, CORS origin, JWT secret, etc.

### 3. Internal Logic

The internal implementation will still leverage conditional logic based on an internal `mode` parameter or environment variable if needed, but the external interface will be through the exported functions.

*   **Conditional Root Route & Static Files:** The landing page route and the primary static file serving will only be registered when `@intranefr/superbackend.server()` is used.
*   **Admin Static Assets:** When `@intranefr/superbackend.middleware()` is used, static assets for admin views will be served under a configurable path (defaulting to `/admin/assets`) within the returned router.

### 5. Documentation

**Implementation Status: ✅ COMPLETED**

The middleware mode has been implemented with the following files:

*   `index.js` - Main entry point exporting both `server()` and `middleware()` functions
*   `src/middleware.js` - Express router for middleware mode
*   `server.js` - Updated to use the new structure (calls `server()` from index.js)
*   `example-middleware-usage.js` - Example integration in a parent application

**Key Features:**

*   No `MIDDLEWARE_MODE` environment variable needed - mode is determined by which function you call
*   Admin views are rendered manually using `fs.readFile()` and `ejs.render()` to avoid view engine conflicts
*   Static assets for admin views are served under `/admin/assets` in middleware mode
*   Health check returns mode information (`standalone` or `middleware`)

## Usage

### Standalone Server Mode

```javascript
// server.js (default)
require('dotenv').config();
const { server } = require('./index');

// Start the standalone server with default options
server();

// Or with custom options:
server({
  port: 3000,
  mongodbUri: 'mongodb://localhost:27017/mydb',
  corsOrigin: 'https://example.com'
});
```

### Middleware Mode (Integration Example)

```javascript
// parent-app.js
const express = require('express');
const { middleware } = require('./index'); 

const app = express();

// Parent application's own middleware and routes
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Parent Application Home');
});

// Mount the SaaS backend middleware at /saas
app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,  // Optional
  corsOrigin: process.env.CORS_ORIGIN || '*',  // Optional
  // dbConnection: mongoose.connection,  // Optional: use existing connection
}));

// Example endpoints:
// GET /saas/api/auth/me - API endpoint
// GET /saas/admin/test - Admin UI (Basic Auth required)
// GET /saas/health - Health check
// GET /saas/admin/assets/css/styles.css - Static assets

app.listen(3001, () => {
  console.log('Parent app listening on port 3001');
  console.log('SaaS backend mounted at /saas');
});
```

See `example-middleware-usage.js` for a complete working example.

## Open Questions / Considerations

*   **Database Connection:** The middleware will try to connect to a database connection passed from the parent application and fallback to process.env.MONGODB_URI if provided. If neither is available, an error will be thrown.
*   **Environment Variables:** All necessary environment variables (e.g., `MONGODB_URI`, `CORS_ORIGIN`, `JWT_SECRET`) should be set in the environment where the parent application runs. The middleware will use `process.env` to access these. Default values will be used if not provided (e.g., `CORS_ORIGIN='*'`). A warning will be logged for missing `MONGODB_URI` and not passed by the parent application.
*   **View Engine Configuration:** To prevent conflicts with the parent application's view engine, the admin views (`admin-test.ejs`, `admin-global-settings.ejs`) will be rendered directly within the middleware by reading and compiling the EJS templates manually. This means the middleware will not use `app.set('view engine', 'ejs')` or `app.set('views', ...)` for its own views, ensuring isolation from the parent application's view rendering setup.
