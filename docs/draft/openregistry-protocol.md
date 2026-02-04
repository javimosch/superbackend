# OpenRegistry Protocol

## Overview

The OpenRegistry protocol defines a standardized way for any backend or system to expose an open registry — a public or private (bearer-protected) endpoint that serves items from a registry. Registries can host any type of items: plugins, services, configurations, templates, or custom resources.

This protocol is intentionally flexible, allowing implementers to define their own item schemas while providing a consistent envelope format for discovery and retrieval.

---

## Core Concepts

### Registry

A registry is a collection of named items accessible via HTTP endpoints. Registries can be:

- **Public**: Accessible without authentication
- **Private**: Require a bearer token for access

### Item

An item represents a single entry in a registry. Items contain a standardized core structure plus an extensible metadata field for type-specific data.

### Category

A category is a logical grouping of items within a registry. A single OpenRegistry implementation can support multiple categories (e.g., plugins, services, templates, connectors), allowing clients to filter and discover items by type.

---

## Endpoints

All endpoints return JSON responses with consistent error handling.

### 1. Auth Check Endpoint

Determines whether the registry requires authentication and what access level is available.

**Endpoint Pattern:**
```
GET /{registry-path}/auth
```

**Response Format:**

```json
{
  "public": boolean,
  "requires_auth": boolean,
  "auth_type": "bearer" | "none",
  "scope": "read" | "read_write",
  "message": "optional human-readable status"
}
```

**Response Examples:**

*Public Registry:*
```json
{
  "public": true,
  "requires_auth": false,
  "auth_type": "none",
  "scope": "read",
  "message": "This registry is publicly accessible"
}
```

*Private Registry (Authenticated):*
```json
{
  "public": false,
  "requires_auth": true,
  "auth_type": "bearer",
  "scope": "read",
  "message": "Authenticated access granted"
}
```

*Private Registry (Invalid/Expired Token):*
```json
{
  "public": false,
  "requires_auth": true,
  "auth_type": "bearer",
  "scope": "none",
  "message": "Token invalid or expired"
}
```

---

### 2. List Endpoint

Retrieves items from the registry with optional filtering, category selection, and pagination.

**Endpoint Pattern:**
```
GET /{registry-path}/list
GET /{registry-path}/list?category={name}&page={number}&limit={number}&filter={query}
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Filter items by category (default: all categories) |
| `page` | integer | No | Page number (1-based, default: 1) |
| `limit` | integer | No | Items per page (default: 20, max: 100) |
| `filter` | string | No | Filter expression for item search |

**Response Format:**

```json
{
  "registry": {
    "name": "string",
    "version": "string",
    "description": "string",
    "categories": ["string", ...]
  },
  "pagination": {
    "page": integer,
    "limit": integer,
    "total_items": integer,
    "total_pages": integer,
    "has_next": boolean,
    "has_prev": boolean,
    "category": "string | null"
  },
  "items": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "version": "string",
      "description": "string",
      "public": boolean,
      "tags": ["string", ...],
      "created_at": "ISO8601-timestamp",
      "updated_at": "ISO8601-timestamp",
      "metadata": {
        // Dynamic field - schema varies by registry type
      }
    },
    ...
  ]
}
```

**Item Visibility Rules:**

| `public` Value | Behavior |
|----------------|----------|
| `true` | Visible to all requests (authenticated or not) |
| `false` | Only visible to authenticated requests with valid bearer token |
| Not defined | Defaults to `true` (backward compatible) |

Items with `public: false` are filtered from the response when:
- No `Authorization` header is present
- Token is invalid or expired
- Token lacks required permissions

**Pagination Behavior:** The `total_items` and `total_pages` values reflect only the items visible to the requester. Unauthenticated requests see fewer items because private items are filtered out before pagination calculations.

**Response Example (Multi-Category Registry):**

```json
{
  "registry": {
    "name": "superbackend-extensions",
    "version": "1.0.0",
    "description": "Official extensions registry for Superbackend platform",
    "categories": ["plugins", "connectors", "templates", "workflows"]
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 47,
    "total_pages": 3,
    "has_next": true,
    "has_prev": false,
    "category": null
  },
  "items": [
    {
      "id": "plugin-auth-oauth2",
      "name": "oauth2-auth-plugin",
      "category": "plugins",
      "version": "2.1.0",
      "description": "OAuth2 authentication provider with PKCE support",
      "public": true,
      "tags": ["auth", "oauth2", "security"],
      "created_at": "2024-08-15T10:30:00Z",
      "updated_at": "2025-01-20T14:45:00Z",
      "metadata": {
        "author": "Superbackend Team",
        "license": "MIT",
        "compatibility": {
          "superbackend_min_version": "1.5.0",
          "superbackend_max_version": "2.0.0"
        },
        "capabilities": [
          "user-authentication",
          "token-refresh",
          "social-providers"
        ],
        "installation": {
          "npm_package": "@superbackend/oauth2-auth",
          "entry_point": "OAuth2AuthPlugin"
        },
        "security": {
          "audit_status": "passed",
          "last_audit_date": "2025-01-15T00:00:00Z"
        }
      }
    },
    {
      "id": "connector-postgres",
      "name": "postgres-connector",
      "category": "connectors",
      "version": "3.0.2",
      "description": "PostgreSQL database connection pool and query builder",
      "public": true,
      "tags": ["database", "postgres", "sql"],
      "created_at": "2024-06-01T08:00:00Z",
      "updated_at": "2025-02-01T09:30:00Z",
      "metadata": {
        "author": "Community Contributor",
        "license": "Apache-2.0",
        "compatibility": {
          "superbackend_min_version": "1.0.0",
          "superbackend_max_version": "2.0.0"
        },
        "capabilities": [
          "connection-pooling",
          "migrations",
          "query-builder",
          "transactions"
        ],
        "installation": {
          "npm_package": "@superbackend/postgres-connector",
          "entry_point": "PostgresConnector"
        },
        "performance": {
          "recommended_pool_size": 10,
          "max_connections": 100
        }
      }
    },
    {
      "id": "plugin-enterprise-sso",
      "name": "enterprise-sso-plugin",
      "category": "plugins",
      "version": "1.0.0",
      "description": "Enterprise SSO integration with SAML 2.0 and OIDC for large organizations",
      "public": false,
      "tags": ["auth", "sso", "enterprise", "saml", "oidc"],
      "created_at": "2025-01-05T11:00:00Z",
      "updated_at": "2025-01-05T11:00:00Z",
      "metadata": {
        "author": "Superbackend Team",
        "license": "Proprietary",
        "compatibility": {
          "superbackend_min_version": "1.8.0",
          "superbackend_max_version": "2.0.0"
        },
        "capabilities": [
          "saml-2.0",
          "oidc",
          "multi-tenant-sso",
          "scim-provisioning"
        ],
        "installation": {
          "npm_package": "@superbackend/enterprise-sso",
          "entry_point": "EnterpriseSSOPlugin",
          "requires_license": true
        },
        "enterprise": {
          "license_tier": "enterprise",
          "support_included": true,
          "setup_required": true
        }
      }
    },
    {
      "id": "template-saas-starter",
      "name": "saas-starter-template",
      "category": "templates",
      "version": "1.2.0",
      "description": "Production-ready SaaS application template with auth, billing, and dashboard",
      "public": true,
      "tags": ["template", "saas", "starter", "boilerplate"],
      "created_at": "2024-09-20T14:00:00Z",
      "updated_at": "2025-01-10T08:15:00Z",
      "metadata": {
        "author": "Superbackend Team",
        "license": "MIT",
        "language": "typescript",
        "framework": "nextjs",
        "features": [
          "authentication",
          "billing",
          "organizations",
          "api-routes"
        ],
        "files_count": 156,
        "size_bytes": 524288
      }
    }
  ]
}
```

**Filtered Response Example (Category: `plugins`):**

```json
{
  "registry": {
    "name": "superbackend-extensions",
    "version": "1.0.0",
    "description": "Official extensions registry for Superbackend platform",
    "categories": ["plugins", "connectors", "templates", "workflows"]
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 12,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false,
    "category": "plugins"
  },
  "items": [
    {
      "id": "plugin-auth-oauth2",
      "name": "oauth2-auth-plugin",
      "category": "plugins",
      "version": "2.1.0",
      "description": "OAuth2 authentication provider with PKCE support",
      "public": true,
      "tags": ["auth", "oauth2", "security"],
      "created_at": "2024-08-15T10:30:00Z",
      "updated_at": "2025-01-20T14:45:00Z",
      "metadata": { ... }
    },
    {
      "id": "plugin-enterprise-sso",
      "name": "enterprise-sso-plugin",
      "category": "plugins",
      "version": "1.0.0",
      "description": "Enterprise SSO integration with SAML 2.0 and OIDC",
      "public": false,
      "tags": ["auth", "sso", "enterprise"],
      "created_at": "2025-01-05T11:00:00Z",
      "updated_at": "2025-01-05T11:00:00Z",
      "metadata": { ... }
    }
  ]
}
```

---

## Authentication

### Bearer Token Usage

When a registry requires authentication, clients must include a bearer token in the `Authorization` header:

```
Authorization: Bearer {token}
```

Tokens are obtained out-of-band (e.g., via an identity provider, admin console, or token issuance endpoint).

### Token Validation

The auth check endpoint validates tokens and returns appropriate scope information. Implementations may return different access levels based on token claims.

---

## Extensibility

### Dynamic Metadata Field

The `metadata` object within each list item is intentionally unstructured. This allows registries to include type-specific information without breaking the protocol specification.

**Example metadata schemas by registry type:**

*Plugins Registry:*
```json
{
  "author": "string",
  "license": "string",
  "compatibility": { ... },
  "capabilities": ["string", ...],
  "installation": { ... }
}
```

*Services Registry:*
```json
{
  "endpoint": "https://...",
  "health_check": "https://...",
  "rate_limits": { ... },
  "sla": { ... }
}
```

*Templates Registry:*
```json
{
  "language": "typescript",
  "framework": "nextjs",
  "files_count": integer,
  "size_bytes": integer
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Missing or invalid bearer token |
| `FORBIDDEN` | Token lacks required permissions |
| `NOT_FOUND` | Registry or resource not found |
| `INVALID_REQUEST` | Malformed request parameters |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server-side error |

---

## Versioning

The OpenRegistry protocol uses semantic versioning for the specification. Registries should declare their supported protocol version in responses:

```json
{
  "registry": {
    "name": "...",
    "protocol_version": "1.0.0"
  }
}
```

---

## Implementation Checklist

- [ ] Implement `GET /auth` endpoint with proper auth detection
- [ ] Implement `GET /list` endpoint with pagination support
- [ ] Add `category` query parameter for filtering
- [ ] Include `category` field on each item
- [ ] Add `public` field to each item (default: `true` if omitted)
- [ ] Filter items with `public: false` from unauthenticated requests
- [ ] Document available `categories` in registry response
- [ ] Include `metadata` field for extensible item data
- [ ] Add bearer token authentication where required
- [ ] Return appropriate error codes
- [ ] Document your registry's categories, visibility rules, and metadata schema

---

## Example: Superbackend Extensions Registry

The Superbackend Extensions Registry demonstrates a complete multi-category implementation:

- **Registry URL**: `https://extensions.superbackend.example`
- **Auth Endpoint**: `https://extensions.superbackend.example/auth`
- **List Endpoint**: `https://extensions.superbackend.example/list`
- **Token issuance**: Via Superbackend Developer Console

**Supported Categories:**
- `plugins` - Authentication, UI, and feature extensions
- `connectors` - Database and external service integrations
- `templates` - Application starters and boilerplates
- `workflows` - Pre-built automation workflows

**Endpoints by Category:**
```
GET /list                      # All items (all categories)
GET /list?category=plugins    # Only plugins
GET /list?category=connectors  # Only connectors
GET /list?category=templates   # Only templates
GET /list?category=workflows   # Only workflows
```

Each item includes its category designation, allowing clients to filter and organize items appropriately. This flexible structure allows a single registry to serve multiple extension types while maintaining a consistent discovery experience.
