---
description: Plan/design for File Manager (user-facing) system built on Assets
---

# File Manager System (FMS) – Plan/Design

## Goals

- Provide a **user-facing** file manager (Google Drive-like) to upload, organize, browse, and share files.
- Reuse the existing **Assets** system (storage + `Asset` model) as the underlying file/blob layer.
- Provide an **admin-controlled public route** that is **disabled by default**, and can be enabled and configured (default `/files`, optionally `/`).
- Use existing **JWT auth** (`POST /api/auth/login`) and store token in **localStorage**.
- Enforce access via existing **RBAC** system with newly introduced **rights keys**.

Non-goals (initial phase):

- True hierarchical filesystem storage in DB (we’ll keep a thin “virtual FS index” but still store blobs as Assets).
- Complex per-user sharing ACLs beyond “make file public / revoke public” + basic constraints.

## Current relevant primitives in the codebase

- **Assets**
  - User API: `POST /api/assets/upload` (JWT), `GET /api/assets` (JWT), `GET /api/assets/:id` (JWT), `GET /api/assets/:id/download` (JWT), `DELETE /api/assets/:id` (JWT).
  - Public asset proxy: `GET /public/assets/*` serves assets where `Asset.visibility === 'public'`.
  - Upload namespaces: `UPLOAD_NAMESPACE.<key>` stored as GlobalSettings type `json`.

- **Settings**
  - Public: `GET /api/settings/public`.
  - Admin basic-auth CRUD: `GET/PUT/POST/DELETE /api/admin/settings/*`.

- **Feature flags**
  - Backed by GlobalSettings `FEATURE_FLAG.<key>`.

- **RBAC**
  - Enforcement helper: `requireRight(requiredRight, { getOrgId })`.
  - Rights registry: `src/utils/rbac/rightsRegistry.js` currently contains a minimal set and supports wildcard matching (e.g. `backoffice:*`, `*`).

- **Admin dashboard navigation**
  - Sidebar modules are defined in `views/partials/dashboard/nav-items.ejs` as `window.NAV_SECTIONS`.

## High-level architecture

### 1) File Manager “system” = public SPA + API endpoints

- **Public SPA** served at a configurable mount prefix (default `/files`) and using hash routing:
  - `/<filesBase>/#/login`
  - `/<filesBase>/#/dashboard`
  - `/<filesBase>/#/files`
  - `/<filesBase>/#/files/:fileId`
  - `/<filesBase>/#/files/:fileId/share`

- **Backend APIs** under `/api/file-manager/*` (JWT required) for:
  - Listing and browsing
  - Upload
  - Rename/move (virtual FS)
  - Delete
  - Share link creation/revocation

### 2) Using Assets under the hood

We store blobs as `Asset` objects.

To support:

- Shared/team folders (org + group drives)
- Overwrite semantics (same folder + filename)

We also introduce a thin **FileEntry** model as a “virtual filesystem index” that:

- Provides stable folder + filename addressing
- Enforces uniqueness constraints per folder
- Points to the underlying `Asset` record

To emulate folders, we use a **flat namespace strategy** for Assets (fast listing/indexing) and keep the user-facing structure in FileEntry.

- **Approach A (recommended): folder path encoded into the asset namespace**.
  - Namespace becomes the “directory”.
  - Moving a file across folders = changing `namespace` (requires a new API since existing user assets API does not expose namespace updates).
  - Pros:
    - Uses indexed `namespace` for fast folder listing.
    - Simple mental model.
  - Cons:
    - Namespace string can grow; needs normalization and length caps.

- **Approach B: fixed namespace + path stored in tags or a JSON Config/side table**.
  - Pros:
    - Namespace remains stable.
  - Cons:
    - Tag querying becomes awkward (tags are simple strings; no structured query).
    - Harder to list “folder contents” efficiently.

This plan assumes **Approach A**.

## Virtual filesystem index (FileEntry)

New Mongo model: `FileEntry`

- `orgId` (required)
- `driveType` enum: `user | group | org`
- `driveId`:
  - for `user`: userId
  - for `group`: rbacGroupId
  - for `org`: orgId
- `parentPath` (string, normalized, root = `/`)
- `name` (string, display name, e.g. `invoice.pdf`)
- `assetId` (ref `Asset`, required)
- `visibility` (mirror of `Asset.visibility` for quick reads)
- `deletedAt` (optional; soft-delete recommended)
- timestamps

Indexes (design intent):

- unique: `{ orgId, driveType, driveId, parentPath, name, deletedAt:null }` (or use `status` instead)
- list: `{ orgId, driveType, driveId, parentPath, name }`

Rationale:

- The `Asset` model lacks `folderPath` and only has `namespace` and `originalName`.
- `objectStorage.generateKey()` generates random keys; without FileEntry we cannot reliably overwrite “same filename in same folder”.

## Namespacing scheme (virtual filesystem)

Proposed namespace format (flat, deterministic):

- `fms_{orgId}_{driveType}_{driveId}_{folderPathSlug}`

Where:

- `system_prefix` = `fms`
- `orgId` = required for RBAC (`requireRight` currently requires `orgId`)
- `driveType` = `user | group | org`
- `driveId` = userId / groupId / orgId
- `folderPathSlug` = a normalized representation of nested folders

Folder encoding:

- Take a folder path like: `"Finance/2026/Invoices"`
- Normalize each segment:
  - lowercase
  - replace spaces with `-`
  - strip unsafe characters
- Join with `--` (double dash) to reduce ambiguity:
  - `finance--2026--invoices`

Examples:

- Root folder:
  - `fms_<orgId>_user_<userId>_root`
  - `fms_<orgId>_group_<groupId>_root`
  - `fms_<orgId>_org_<orgId>_root`
- Nested:
  - `fms_<orgId>_user_<userId>_finance--2026--invoices`

Constraints:

- Enforce a maximum namespace length (e.g. 200 chars) and maximum depth (e.g. 20) at the File Manager API layer.

## Configuration / persistence

### Public route enable + mount path

Use Global Settings (admin-controlled, persisted, simple) with **env fallback**:

- `FILE_MANAGER_ENABLED` (type `boolean`, public `false`)
- `FILE_MANAGER_BASE_PATH` (type `string`, public `false`, default `/files`)

Notes:

- The route is **disabled by default** (no public page/SPA served).
- The system will read settings from Global Settings first, then fallback to env:
  - `FILE_MANAGER_ENABLED`
  - `FILE_MANAGER_BASE_PATH`
- Changes require **restart** (acceptable).
- `FILE_MANAGER_BASE_PATH` must allow:
  - `/files` (default)
  - `/` (root) — supported but needs strong warnings.
- Validate base path:
  - must start with `/`
  - no query
  - no `#`
  - no trailing slash except `/`

### File Manager public UI config

If the SPA needs additional runtime configuration, prefer a **public JSON config** or public settings.

Two options:

- **Option 1**: `GET /api/settings/public` + read keys with prefix `PUBLIC_FILE_MANAGER_*`.
- **Option 2 (recommended for richer config)**: A JSON config slug, e.g. `file-manager-public-config` (publicEnabled true).

This plan recommends **Option 1** initially (simpler): keep config minimal.

## RBAC rights (new keys)

Add these rights to the rights registry (so admins can assign them via existing RBAC UI):

- `file_manager:access` – can use the file manager UI / APIs
- `file_manager:drives:read` – list available drives (My Drive / Group Drives / Org Drive)
- `file_manager:files:read` – list/view metadata
- `file_manager:files:upload` – upload
- `file_manager:files:download` – download
- `file_manager:files:update` – rename/move
- `file_manager:files:delete` – delete
- `file_manager:files:share` – toggle visibility to public/private

Optional wildcard planning:

- `file_manager:*` to simplify role assignment

Important: `requireRight()` currently requires an `orgId` resolvable from the request.

## API design

### Authentication

- SPA uses existing auth endpoints:
  - `POST /api/auth/login`
  - `GET /api/auth/me` (to validate token)
- Store access token in `localStorage`:
  - key: `sb_fm_access_token` (proposed)

### Proposed endpoints (JWT)

Base: `/api/file-manager`

All endpoints require:

- `authenticate`
- RBAC check via `requireRight()`
- `orgId` (in body/query/header) so RBAC can resolve membership.

All UIs must include an **org selector** (autocomplete/select).

Endpoints:

- `GET /api/file-manager/drives` (JWT)
  - query: `orgId`
  - returns drives available to the user in the org (My Drive + group drives + org drive)

As-built:

- Response includes `drives: [{ driveType, driveId, label }]`.

- `GET /api/file-manager/folders` (JWT)
  - query: `orgId`, `driveType`, `driveId`, `folderPath` (folder path)
  - `path` is also accepted for compatibility
  - returns folder list + files list

As-built:

- Response includes `files` (SPA) and `entries` (compat), with items enriched with `contentType` and `size` from the underlying `Asset`.

- `POST /api/file-manager/files/upload` (JWT, multipart)
  - body/query: `orgId`, `driveType`, `driveId`, `folderPath` (optional), `visibility` (optional)
  - uses assets upload internally but forces namespace to computed FMS namespace.
  - creates/updates a `FileEntry`.
  - supports overwrite with confirm (see Overwrite semantics).

As-built:

- The SPA sends upload scope via query params; the API accepts both query and body.

- `GET /api/file-manager/files/:id` (JWT)
  - returns file metadata if user can access

- `GET /api/file-manager/files/:id/download` (JWT)
  - proxy to assets download but with FMS RBAC checks

As-built:

- Download sets `Content-Disposition: inline` when a filename is available to allow browser previews.

- `PATCH /api/file-manager/files/:id` (JWT)
  - body: `orgId`, `driveType`, `driveId`, `name` (optional), `folderPath` (optional)
  - for rename/move (updates FileEntry and potentially Asset namespace)

- `DELETE /api/file-manager/files/:id` (JWT)
  - body/query: `orgId`, `driveType`, `driveId`

- `POST /api/file-manager/files/:id/share` (JWT)
  - body: `orgId`, `driveType`, `driveId`, `enabled` (boolean)
  - if `enabled=true`, set `Asset.visibility='public'` (and mirror on FileEntry)
  - if `enabled=false`, set `Asset.visibility='private'`

### Sharing (direct, via Asset visibility)

Sharing is implemented by toggling `Asset.visibility`:

- When `visibility='public'`, the file is accessible at `GET /public/assets/<asset.key>`.
- Share UI should display that URL as the “public link”.
- Revoke share = set `visibility='private'`.

This is direct and uses the existing public assets proxy.

Important tradeoff:

- This is effectively “anyone with the link can access” (no expiry unless we add a token system later).

## Public UI (SPA) design

Tech constraints you set:

- Vue3 CDN
- Tailwind CDN
- DaisyUI CDN
- Hash-based routing

Plan:

- Serve a single HTML shell at `/<filesBase>/index.html` (or EJS) that loads:
  - Vue3
  - Tailwind
  - DaisyUI
  - a small JS bundle (could be inline or served from `/public/js/...`)

Pages:

- Login
  - form -> `POST /api/auth/login`
  - store token in `localStorage`
  - redirect to `#/files`

- Files view
  - folder tree (virtual)
  - file list
  - upload button

- File details
  - metadata
  - download
  - share link management

Client-side routing:

- minimal router based on `window.location.hash` parsing.

As-built:

- Implemented routes: `#/login` and `#/browse`.

## Admin UI changes

### 1) Add “File Manager” module to admin dashboard navigation

Update `views/partials/dashboard/nav-items.ejs`:

- Add a new nav item:
  - `id: 'file-manager'`
  - `label: 'File Manager'`
  - `path: adminPath + '/file-manager'`
  - `icon: 'ti-folder'` (or another Tabler icon)

### 2) Create dedicated admin page

Create `views/admin-file-manager.ejs` (new) that:

- Shows a toggle for `FILE_MANAGER_ENABLED`
- Shows an input for `FILE_MANAGER_BASE_PATH`
- Shows the resulting URL (respecting `req.baseUrl` mount prefix)
- Warns strongly when setting base path to `/`

Backed by existing global settings admin endpoints:

- `GET /api/admin/settings`
- `PUT /api/admin/settings/:key`

## Routing/mounting strategy for the public route

The middleware is mounted by host apps possibly under a prefix (e.g. `/saas`).

We must ensure:

- The File Manager base path is **relative to the SuperBackend mount prefix**.
- Example: host mounts superbackend at `/saas` and admin sets base to `/files`.
  - Public SPA served at `/saas/files`.

Implementation plan (later):

- During middleware init, read `FILE_MANAGER_ENABLED` and `FILE_MANAGER_BASE_PATH` from `globalSettings.service`.
- Conditionally register a route handler for `BASE_PATH`.
- If setting changes at runtime, we either:
  - require restart, or
  - implement a dynamic router that checks settings per-request.

This plan assumes:

- Read from global settings with env fallback
- Changes require restart

As-built:

- `FILE_MANAGER_ENABLED` and `FILE_MANAGER_BASE_PATH` are read once at middleware initialization and cached in memory.
- The SPA is served by a gated handler that matches the configured base path.

## Data access rules (ownership vs org)

Assets currently have both `ownerUserId` and `orgId`.

For File Manager, define:

- All operations are scoped to `orgId` (for RBAC).
- Drives are one of:
  - **My Drive**: `driveType=user`, `driveId=req.user._id`
  - **Group drive**: `driveType=group`, `driveId=<rbacGroupId>`
  - **Org drive**: `driveType=org`, `driveId=orgId`

Ownership rules:

- The canonical “file identity” is `FileEntry`.
- Assets are blobs; `Asset.ownerUserId` is:
  - user drive: set to the uploading user
  - group/org drive: set to `null` (or the uploader) depending on auditing preferences

## Overwrite semantics

Conflict policy: **overwrite with confirm**.

UI flow:

- On upload, if a file with the same `parentPath + name` exists:
  - show confirm dialog “Overwrite existing file?”
  - if confirmed: upload proceeds with overwrite

API design:

- `POST /api/file-manager/files/upload` accepts `overwrite=true|false`.
- If `overwrite=false` (default) and conflict exists: return `409` with conflict info.
- If `overwrite=true`:
  - replace underlying object contents (write to same `Asset.key`)
  - update `Asset.contentType`, `Asset.sizeBytes`, `Asset.originalName`, `updatedAt`
  - keep `Asset._id` stable (so existing references remain valid)
  - update `FileEntry.assetId` only if we intentionally create a new Asset (not recommended)

## Open questions (locked decisions)

1. **Group drives source of truth**:
   - Locked: group drives map to **RBAC groups** (`RbacGroup`).

2. **Drive listing rules**:
   - Locked: show **My Drive**, **Group Drives**, and **Org Drive** by default (actions gated by RBAC).

3. **Sharing via `Asset.visibility`**:
   - Locked: visibility-only sharing is final for now (no expiry; revoke by setting private).
   - Locked: “unguessable key URL” is acceptable.

4. **Public download headers**:
   - Locked: allow inline previews where the browser supports it.

## Rollout plan (phased)

- Phase 0: Admin toggle + base path settings + SPA shell with login + org selector
- Phase 1: Drives (user/group/org) + list/upload/download/delete with `FileEntry`
- Phase 2: Rename/move between folders
- Phase 3: Sharing via `Asset.visibility` + overwrite semantics finalized

