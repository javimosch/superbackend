# File Manager

## Overview

The File Manager provides a user-facing UI and a set of JWT-protected APIs to upload, browse, organize, download, and share files. Files are stored as `Asset` records and indexed by a virtual filesystem model (`FileEntry`).

The system supports three drive types:

- **User drive** (My Drive)
- **Group drives** (RBAC groups)
- **Org drive**

Sharing is implemented by toggling `Asset.visibility` between `private` and `public`, which enables access via the public assets proxy.

## Configuration

### Global Settings

- **`FILE_MANAGER_ENABLED`** (boolean)
  - When `true`, the public File Manager SPA is served.
  - Intended to be restart-required.

- **`FILE_MANAGER_BASE_PATH`** (string)
  - Public SPA mount path (default `/files`).
  - Intended to be restart-required.

- **`FILE_MANAGER_MAX_UPLOAD_BYTES`** (number)
  - Maximum allowed upload size (bytes) for `POST /api/file-manager/files/upload`.
  - Default: `1073741824`.
  - Intended to apply immediately to uploads.

These settings are managed via the admin page and stored in Global Settings.

## Public UI

### Route

- Served at: `<mountPrefix><FILE_MANAGER_BASE_PATH>`
- Hash routing:
  - `#/login`
  - `#/browse`

### Auth

- Login uses `POST /api/auth/login`.
- Access token is stored in `localStorage`:
  - key: `sb_fm_access_token`

### Core behaviors

- Org selection is required to scope all operations.
- Drive selection determines `driveType` and `driveId`.
- Folder navigation uses a normalized `folderPath` string (root is `/`).
- Upload supports overwrite via an explicit overwrite option.
- Rename/move updates file name and/or folder path.
- Sharing toggles public/private and exposes the public asset URL when public.

Upload behavior:

- Upload accepts any content type.
- Maximum upload size is enforced by `FILE_MANAGER_MAX_UPLOAD_BYTES`.

## Backend Models

### `FileEntry`

Virtual filesystem index.

Fields:

- `orgId`
- `driveType` (`user | group | org`)
- `driveId`
- `parentPath` (normalized, root is `/`)
- `name`
- `assetId`
- `visibility` (mirrors `Asset.visibility`)
- `deletedAt` (soft-delete)
- timestamps

Uniqueness is enforced per folder:

- `{ orgId, driveType, driveId, parentPath, name, deletedAt: null }`

## Namespacing

Assets use a deterministic namespace derived from:

- `orgId`
- `driveType`
- `driveId`
- `parentPath`

Format:

- `fms_{orgId}_{driveType}_{driveId}_{folderPathSlug}`

Where `folderPathSlug` encodes the path segments and joins with `--`, using `root` for `/`.

For File Manager uploads, the effective namespace policy is derived from the resolved `default` upload namespace, but:

- `allowedContentTypes` is treated as empty (no content type restrictions)
- `maxFileSizeBytes` is set from `FILE_MANAGER_MAX_UPLOAD_BYTES`

## RBAC

APIs are JWT-protected and gated by RBAC rights.

Rights:

- `file_manager:access`
- `file_manager:drives:read`
- `file_manager:files:read`
- `file_manager:files:upload`
- `file_manager:files:download`
- `file_manager:files:update`
- `file_manager:files:delete`
- `file_manager:files:share`

## API

Base: `/api/file-manager`

All endpoints require JWT auth and an `orgId` to be present in query/body/headers for RBAC scoping.

### `GET /drives`

Query:

- `orgId`

Response:

- `drives: [{ driveType, driveId, label }]`

### `GET /folders`

Query:

- `orgId`
- `driveType`
- `driveId`
- `folderPath` (or `path`)

Response:

- `files: [{ id, name, parentPath, visibility, assetId, assetKey, publicUrl, contentType, size, createdAt, updatedAt }]`

### `POST /files/upload`

Multipart form-data:

- `file` (binary)

Query/body:

- `orgId`
- `driveType`
- `driveId`
- `folderPath`
- `overwrite` (`true|false`)

Behavior:

- When overwriting, the underlying object is replaced by writing to the same `Asset.key`.

### `GET /files/:id/download`

Query:

- `orgId`
- `driveType`
- `driveId`

Behavior:

- Responds with `Content-Disposition: inline` when a filename is available to allow browser preview.

### `PATCH /files/:id`

Body:

- `orgId`
- `driveType`
- `driveId`
- `name` (optional)
- `folderPath` (optional)

Behavior:

- Enforces uniqueness in the target folder.
- Updates `FileEntry`.
- Updates `Asset.namespace` to match the destination folder.

### `DELETE /files/:id`

Query/body:

- `orgId`
- `driveType`
- `driveId`

### `POST /files/:id/share`

Body:

- `orgId`
- `driveType`
- `driveId`
- `enabled` (boolean)

Behavior:

- `enabled=true` sets `Asset.visibility='public'`.
- `enabled=false` sets `Asset.visibility='private'`.
- When public, the public link is:
  - `/public/assets/<asset.key>`
