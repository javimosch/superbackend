# Granular RBAC System Analysis & Plan (SaaSBackend)

## Core Philosophy: Additive & Non-Breaking
The goal is to provide a "RBAC Capability Layer" that parent applications can opt into. We will not modify existing route logic or force a migration. Instead, we offer:
1.  **Capability Registry:** A place to define what can be done.
2.  **Resolution Service:** Helpers to map existing roles to granular permissions.
3.  **Opt-in Middleware:** New decorators for routes that need granular control.

## 1. System Components (The "Core")

### A. The Permission Engine (`src/utils/rbac/engine.js`)
A stateless utility that handles the logic of permission matching.
- Supports wildcards (`landings:*`).
- Supports explicit denial (future-proofing).
- **API:** `hasPermission(userPermissions, requiredPermission)`

### B. Standard Capability Map (`src/utils/rbac/defaults.js`)
Defines the "Out-of-the-box" mapping for existing `ref-superbackend` roles.
- **Example Mapping:**
  ```javascript
  {
    owner: ['*:*'],
    admin: ['users:manage', 'org:write', 'landings:*'],
    member: ['org:read', 'landings:read']
  }
  ```

### C. Internal Service Helper (`src/services/rbac.service.js`)
The bridge between the DB models and the RBAC engine.
- Resolves a user's role + organization context into an array of effective permissions.
- Allows the parent app to inject "Custom Permissions" during resolution.

## 2. Integration APIs (For Parent/External Apps)

### A. Middleware: `requirePermission(permission)`
A new middleware in `src/middleware/rbac.js` that:
1. Checks if `req.orgMember` exists.
2. Resolves permissions via `rbacService`.
3. Validates against the required permission.
4. *Fall-through:* If the parent app hasn't configured granular RBAC, it can optionally fall back to existing role-level checks.

### B. API Endpoint: `GET /api/rbac/my-permissions`
Returns the current user's effective permissions for the active organization. Useful for frontend UI toggling (e.g., hiding a "Delete" button).

## 3. Implementation Plan (Additive Only)

### Phase 1: The Registry & Engine
- Create `src/utils/rbac/` directory.
- Implement the `engine.js` (logic) and `defaults.js` (standard roles mapping).
- **Result:** No impact on existing code.

### Phase 2: Resolution Service
- Create `src/services/rbac.service.js`.
- Add unit tests verifying that 'admin' resolves to the correct permissions without touching the DB.
- **Result:** Internal utilities available for use.

### Phase 3: Opt-in Middleware & Documentation
- Create `src/middleware/rbac.js`.
- Add a "Granular RBAC Integration Guide" to `docs/`.
- **Result:** Parent app can now start using `router.post('/secret', requirePermission('secret:write'), ...)` without breaking existing routes using `requireOrgRoleAtLeast`.

## Security Invariants
- **Fail-Closed:** If no permissions are found or the engine fails, access is denied.
- **Isolation:** RBAC logic is decoupled from the `OrganizationMember` model to allow for future "Custom Roles" stored in different collections.
- **Non-Invasive:** Existing `admin` role (System level) still bypasses all checks via a global override in the engine.
