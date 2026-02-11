# Registry System Plan

## Overview

Build a new "Registry System" for Superbackend that implements the OpenRegistry protocol. The system manages multiple registries, stores all items in JSON Config files (no MongoDB), and provides an admin UI for configuration including public/protected modes with multiple API tokens.

---

## Architecture

### Components

1. **Registry Service** - Core service implementing OpenRegistry protocol
2. **Registry Admin API** - Endpoints for CRUD on registries, tokens, and items
3. **Registry Admin UI** - Dedicated admin view for registry management
4. **JSON Config Storage** - All data persisted via existing JSON Config system

### Data Model (JSON Config)

**Registry Configuration Structure:**

```json
{
  "registries": {
    "registry-id-1": {
      "id": "registry-id-1",
      "name": "Plugins Registry",
      "description": "Official plugins for Superbackend",
      "public": false,
      "tokens": [
        {
          "id": "token-1",
          "name": "Production Token",
          "token_hash": "sha256:abc123...",
          "scopes": ["read"],
          "enabled": true,
          "created_at": "2025-02-01T10:00:00Z"
        }
      ],
      "items": {
        "plugin-auth-oauth2": {
          "id": "plugin-auth-oauth2",
          "name": "oauth2-auth-plugin",
          "category": "plugins",
          "version": 2,
          "versions": [1, 2],
          "description": "OAuth2 authentication provider",
          "public": true,
          "tags": ["auth", "oauth2", "security"],
          "created_at": "2024-08-15T10:30:00Z",
          "updated_at": "2025-01-20T14:45:00Z",
          "metadata": { /* ... */ }
        }
      },
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-02-01T10:00:00Z"
    }
  }
}
```

**Item Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Human-readable name |
| `category` | string | Category the item belongs to |
| `version` | integer | Latest version number |
| `versions` | integer[] | Array of available versions |
| `description` | string | Brief description |
| `public` | boolean | Visibility to unauthenticated requests |
| `tags` | string[] | Tags for discovery |
| `created_at` | ISO8601 | Creation timestamp |
| `updated_at` | ISO8601 | Last update timestamp |
| `metadata` | object | Dynamic type-specific data |

**Note:** `version` is an integer (not semantic version string). `versions` array contains all available version integers for the item.

---

## Endpoints

### Registry Admin API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/registries` | List all registries |
| `POST` | `/admin/registries` | Create new registry |
| `GET` | `/admin/registries/:id` | Get registry details |
| `PUT` | `/admin/registries/:id` | Update registry config |
| `DELETE` | `/admin/registries/:id` | Delete registry |

### Registry Tokens API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/registries/:id/tokens` | List tokens for registry |
| `POST` | `/admin/registries/:id/tokens` | Create new token |
| `DELETE` | `/admin/registries/:id/tokens/:tokenId` | Revoke token |

### Registry Items API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/registries/:id/items` | List items in registry |
| `POST` | `/admin/registries/:id/items` | Add item to registry |
| `PUT` | `/admin/registries/:id/items/:itemId` | Update item |
| `DELETE` | `/admin/registries/:id/items/:itemId` | Delete item |

### OpenRegistry Protocol Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/registry/:id/auth` | Auth check (public/protected) |
| `GET` | `/registry/:id/list` | List items with pagination & filtering |

**List Endpoint Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Filter by category (default: all) |
| `version` | integer or "latest" | Filter by specific version |
| `minimal` | boolean | Return response without metadata (default: false) |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 20, max: 100) |
| `filter` | string | Search filter expression |

**Version Filtering Behavior:**

| Query | Result |
|-------|--------|
| `version=1` | Items with version 1 available |
| `version=latest` | Latest version per item |
| `version` omitted | All versions available per item |

**Minimal Mode:** When `minimal=true`, the response excludes the `metadata` field from items, enabling efficient discovery of available items and versions.

**Security:**
- CORS: Already supported by Superbackend (no additional config needed)
- Rate Limiting: Apply Rate Limiter middleware to all `/registry/*` endpoints

---

## Implementation Plan

### Phase 1: Registry Service Foundation

1. **Create registry service module**
   - `services/registry-service.js`
   - CRUD operations for registries using JSON Config
   - Token generation and validation
   - Item management

2. **Create registry admin routes**
   - `routes/admin/registries.js`
   - Full CRUD for registries, tokens, items
   - Input validation and error handling

3. **Implement token system**
   - Token generation (secure random)
   - Token hashing (sha256)
   - Token scopes (read, write)
   - Integration with global settings system for secure storage

### Phase 2: OpenRegistry Protocol Implementation

1. **Auth endpoint**
   - `GET /registry/:id/auth`
   - Check registry public/protected status
   - Validate bearer token if protected
   - Return auth status and scope

2. **List endpoint**
   - `GET /registry/:id/list`
   - Support `category` query param for filtering
   - Support `page` and `limit` pagination
   - Support `filter` for searching
   - Support `version` query param:
     - Integer value filters to specific version
     - "latest" returns only latest version per item
   - Support `minimal` query param:
     - `minimal=true` excludes `metadata` from response
     - Ideal for quick discovery and version comparison
   - Filter items based on `public` field and auth status
   - Return paginated items with `version` (integer) and `versions` (array) fields

### Phase 3: Admin UI

1. **Registry list view**
   - Table of all registries
   - Quick stats (item count, public/protected status)
   - Create new registry button

2. **Registry detail view**
   - Registry settings (name, description, public/protected toggle)
   - Token management section
   - Items list with search/filter
   - Add/Edit item form

3. **Token management**
   - Create token modal
   - Token list with last used, enabled status
   - Revoke token action
   - Copy token value (shown once on creation)

4. **Item management**
   - List items with pagination
   - Add item form with fields:
     - ID, Name, Category, Description
     - Version (integer, latest)
     - Versions (integer array, auto-populated)
     - Public/Private toggle
     - Tags (array)
     - Metadata (JSON editor)
   - Edit item inline or modal
   - Delete item with confirmation
   - View available versions per item

### Phase 4: Integration & Polish

1. **Admin navigation**
   - Add "Registries" link to admin sidebar

2. **Global settings integration**
   - Store secure token hashes in global settings
   - Access via existing settings service

3. **Bulk operations**
   - Import items from JSON
   - Export items to JSON
   - Bulk delete

4. **Documentation**
   - Admin API documentation
   - OpenRegistry protocol reference
   - Usage examples

---

## UI Mockup: Registry Management

```
┌─────────────────────────────────────────────────────────────────┐
│  Registries                                          [+ New]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Plugins Registry                              [Edit]     │  │
│  │  Status: 🔒 Protected    Items: 47    Tokens: 3          │  │
│  │                                                          │  │
│  │  [Tokens] [Items] [Settings]                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Templates Registry                            [Edit]     │  │
│  │  Status: 🔓 Public       Items: 12    Tokens: 0          │  │
│  │                                                          │  │
│  │  [Tokens] [Items] [Settings]                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── services/
│   └── registry-service.js
├── routes/
│   ├── admin/
│   │   └── registries.js
│   └── registry.js          # OpenRegistry protocol endpoints
├── controllers/
│   └── registry-controller.js
├── utils/
│   └── token-generator.js
└── validations/
    └── registry-validation.js

config/
└── json/
    └── registries.json      # Stores all registry data

docs/
└── features/
    └── registry-system.md    # Feature documentation

admin/
├── pages/
│   └── registries/
│       ├── index.vue         # Registry list
│       ├── [id].vue          # Registry detail
│       ├── [id]/items.vue   # Item management
│       └── [id]/tokens.vue   # Token management
└── components/
    └── registry/
        ├── RegistryCard.vue
        ├── TokenList.vue
        └── ItemForm.vue
```

---

## Open Questions (Resolved)

| Question | Decision | Notes |
|----------|----------|-------|
| CORS support? | ✅ Already supported | Superbackend handles CORS globally |
| Rate limiting? | ✅ Add Rate Limiter middleware | Use existing Rate Limiter system on `/registry/*` |
| Webhooks? | ❌ Out of scope | Future enhancement |
| Item versioning? | ✅ Implemented | Protocol v1.1.0: integer version, versions array, version filtering |
| Minimal mode? | ✅ Implemented | `minimal=true` query param excludes metadata from response |

---

## Dependencies

- Existing JSON Config system
- Existing admin UI framework
- Existing global settings system (for token storage)
- Existing Rate Limiter system (for `/registry/*` endpoints)
- OpenRegistry Protocol v1.1.0 specification (see `docs/draft/openregistry-protocol.md`)
- No new MongoDB schemas required

---

## Estimated Effort

- Phase 1 (Foundation): 2-3 days
- Phase 2 (Protocol): 1-2 days
- Phase 3 (Admin UI): 3-4 days
- Phase 4 (Integration): 1-2 days

**Total: ~7-11 days**
