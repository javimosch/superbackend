# Endpoint Prefix Patterns

This document outlines the current endpoint prefix patterns used in the SuperBackend system.

## Primary Prefix Categories

### 1. `/api` Prefix - Main API Endpoints

All public and authenticated API endpoints use the `/api` prefix:

- `/api/auth` - Authentication endpoints (login, register, refresh, me)
- `/api/billing` - Billing related endpoints
- `/api/forms` - Public form submissions
- `/api/webhooks` - Webhook handling and processing
- `/api/settings` - Global settings management
- `/api/feature-flags` - Feature flag management
- `/api/json-configs` - JSON configuration management
- `/api/assets` - Asset management and serving
- `/api/i18n` - Internationalization endpoints
- `/api/headless` - Headless CMS functionality
- `/api/notifications` - Notification system
- `/api/user` - User management endpoints
- `/api/orgs` - Organization management
- `/api/invites` - Invitation system
- `/api/log` - Logging endpoints
- `/api/error-tracking` - Error tracking and reporting
- `/api/ui-components` - Public UI components
- `/api/rbac` - Role-based access control
- `/api/file-manager` - File management system

### 2. `/api/admin` Prefix - Admin-specific Endpoints

All admin-specific API endpoints are grouped under `/api/admin`:

- `/api/admin` - Core admin operations (users, tokens, webhooks)
- `/api/admin/settings` - Admin settings management
- `/api/admin/feature-flags` - Admin feature flag controls
- `/api/admin/rate-limits` - Rate limiting configuration
- `/api/admin/proxy` - Admin proxy functionality
- `/api/admin/seo-config` - SEO configuration management
- `/api/admin/i18n` - Admin internationalization
- `/api/admin/headless` - Admin headless CMS
- `/api/admin/scripts` - Admin script management
- `/api/admin/crons` - Cron job management
- `/api/admin/health-checks` - Health check monitoring
- `/api/admin/cache` - Cache management
- `/api/admin/console-manager` - Console manager access
- `/api/admin/db-browser` - Database browser interface
- `/api/admin/terminals` - Terminal access and management
- `/api/admin/assets` - Admin asset management
- `/api/admin/upload-namespaces` - Upload namespace management
- `/api/admin/ui-components` - Admin UI components
- `/api/admin/migration` - Migration tools and utilities
- `/api/admin/errors` - Error management and tracking
- `/api/admin/audit` - Audit log access
- `/api/admin/llm` - LLM management and configuration
- `/api/admin/ejs-virtual` - Virtual EJS file management
- `/api/admin/pages` - Page management system
- `/api/admin/workflows` - Workflow management
- `/api/admin/forms` - Admin form management
- `/api/admin/orgs` - Admin organization management
- `/api/admin/users` - Admin user management
- `/api/admin/rbac` - Admin RBAC management
- `/api/admin/notifications` - Admin notification management
- `/api/admin/stripe` - Admin Stripe integration

### 3. Configurable Admin Path - Admin UI Pages

The admin dashboard UI pages use a configurable path (default: `/admin`):

**Configuration**: Set via `options.adminPath` when creating middleware

**Default endpoints** (using `/admin` as example):
- `/admin` - Main admin dashboard
- `/admin/health-checks` - Health checks monitoring page
- `/admin/console-manager` - Console manager interface
- `/admin/rbac` - RBAC management page
- `/admin/terminals` - Terminal access page
- `/admin/scripts` - Script management page
- `/admin/crons` - Cron job management page
- `/admin/cache` - Cache management page
- `/admin/db-browser` - Database browser page
- `/admin/migration` - Migration tools page
- `/admin/workflows/:id` - Workflow detail page
- `/admin/pages` - Page management page
- `/admin/blog` - Blog management page
- `/admin/blog-automation` - Blog automation page
- `/admin/blog/new` - New blog creation page
- `/admin/blog/edit/:id` - Blog editing page
- `/admin/api/test` - API testing interface

### 4. Special Prefixes

- `/w` - Workflow webhooks (shortened for convenience)
- `/api/internal` - Internal blog endpoints (used by HTTP CronJobs)
- `/public/assets` - Public asset routes
- `/api/waiting-list` - Waiting list management
- `/api/metrics` - Metrics and analytics
- `/api/error-tracking` - Error tracking endpoints

## Configuration Options

The middleware accepts these prefix configuration options:

```javascript
const middleware = require('./src/middleware');

const router = middleware({
  adminPath: '/admin',     // Default: '/admin' - Admin UI pages path
  pagesPrefix: '/',        // Default: '/' - Pages routing prefix
  // ... other options
});
```

## Authentication Patterns

### Basic Authentication
Admin UI pages and some admin endpoints use `basicAuth`:
- All `/admin/*` UI pages
- `/api/admin/errors`
- `/api/admin/audit`
- `/api/admin/workflows`

### Token-based Authentication
Most API endpoints use JWT token authentication via the `authenticate` middleware.

### Public Endpoints
Some endpoints are publicly accessible:
- `/api/auth/register`
- `/api/auth/login`
- `/api/forms` (public forms)
- `/api/webhooks` (webhook receivers)
- `/public/assets` (static assets)

## Static Asset Serving

- Admin assets: `${adminPath}/assets` (e.g., `/admin/assets`)
- Public assets: `/public/assets`

## File Structure

Routes are organized in `/src/routes/` with consistent naming:
- `admin*.routes.js` - Admin-specific routes
- `*.routes.js` - Public API routes
- Each route file exports an Express router

## Examples

### Public API Endpoint
```
GET /api/auth/me
POST /api/forms/submit
GET /api/ui-components/public
```

### Admin API Endpoint
```
GET /api/admin/users
POST /api/admin/settings
DELETE /api/admin/cache/clear
```

### Admin UI Page
```
GET /admin/dashboard
GET /admin/users
GET /admin/settings
```

## Global Rate Limiting

All `/api/*` endpoints are subject to global rate limiting:
```javascript
router.use("/api", rateLimiter.limit("globalApiLimiter"));
```

## WebSocket Support

WebSocket endpoints are attached to the admin path:
```javascript
attachTerminalWebsocketServer(server, { basePathPrefix: adminPath });
```

## Best Practices

1. **Consistent Prefixing**: All API endpoints should use `/api` prefix
2. **Admin Separation**: Admin endpoints should be under `/api/admin`
3. **UI vs API**: Admin UI pages use the configurable `adminPath`, not `/api/admin`
4. **Authentication**: Use appropriate authentication middleware for each endpoint category
5. **Naming**: Route files should be descriptive and follow the `*.routes.js` pattern
