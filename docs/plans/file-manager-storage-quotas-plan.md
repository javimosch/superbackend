# File Manager Storage & Quota System Plan

## Goal
Add a storage/quota configuration system that supports:

- Global defaults
- Per-org overrides
- Per-group (RBAC group) overrides within an org

And exposes:

- **Max upload size**
- **Max storage size**

With clear precedence rules and user-facing visibility of the effective configuration.

This plan covers **design + wiring only** (admin UI, backend settings, SPA display/persistence), not implementation.

---

## Requirements (as requested)

### Admin UI (File Manager Admin)
Add a **Storage configuration** section supporting:

- Global max upload size (human units helper, e.g. `50mb`, `1gb`)
- Global max storage size (human units helper)
- Per-org max upload size + max storage size
- Per-group max upload size + max storage size (groups scoped to org)
- Per-user max upload size + max storage size (for user drives)

Rules example to support:

- Global max upload size (existing field) `50mb` (acts as global default)
- Global max upload size set in Storage section `40mb` => **takes precedence** over the global default
- Org `Toto` max storage size `1gb`
- Group `Toto basic` max storage `100mb`
- Group `Toto premium` max storage `5gb`
- User in org but in no group => org max `1gb`
- User in multiple groups => pick the **largest** max storage (e.g. `5gb`)

Info text:

- Default max storage size when nothing matches is taken from an **env var**, with fallback to **100mb**.

### Public SPA

- Persist workspace settings (org, drive) in `localStorage` so full refresh re-selects last values
- Show **Storage** info: the current effective config (or global default) visible to the user

---

## Proposed Configuration Keys

### Existing
- `FILE_MANAGER_MAX_UPLOAD_BYTES` (number)

### New (proposed)
- `FILE_MANAGER_GLOBAL_MAX_UPLOAD_BYTES` (number)
  - Value entered in the new Storage section.
  - Precedence: if set and valid, overrides `FILE_MANAGER_MAX_UPLOAD_BYTES`.

- `FILE_MANAGER_DEFAULT_MAX_STORAGE_BYTES` (env)
  - Proposed env: `FILE_MANAGER_DEFAULT_MAX_STORAGE_BYTES`
  - Fallback: `104857600` (100mb)

- `FILE_MANAGER_STORAGE_POLICY_JSON` (json)
  - Stores the per-org/per-group overrides.
  - Example shape:

```json
{
  "version": 1,
  "global": {
    "maxUploadBytes": 41943040,
    "maxStorageBytes": 1073741824
  },
  "orgs": {
    "<orgId>": {
      "maxUploadBytes": 41943040,
      "maxStorageBytes": 1073741824,
      "users": {
        "<userId>": { "maxUploadBytes": 41943040, "maxStorageBytes": 10737418240 }
      },
      "groups": {
        "<groupId>": { "maxUploadBytes": 10485760, "maxStorageBytes": 104857600 },
        "<groupId2>": { "maxUploadBytes": 52428800, "maxStorageBytes": 5368709120 }
      }
    }
  }
}
```

Notes:
- We store IDs, not names, to avoid rename issues.
- Keep a `version` for forwards-compatible migrations.

---

## Precedence Rules

All limits are evaluated **per drive**.

### Max upload size
Resolution order: `user > group > org > global > default`.

- **Org drive**: org -> global -> default
- **Group drive**: group -> org -> global -> default
- **User drive**: user -> group(max) -> org -> global -> default

Defaults:

- Default max upload bytes uses `FILE_MANAGER_MAX_UPLOAD_BYTES` if present, otherwise falls back to `FILE_MANAGER_DEFAULT_MAX_UPLOAD_BYTES` env, otherwise `1073741824`.

### Max storage size
Resolution order: `user > group > org > global > default`.

- **Org drive**: org -> global -> default
- **Group drive**: group -> org -> global -> default
- **User drive**: user -> group(max) -> org -> global -> default

Defaults:

- Default max storage bytes uses `FILE_MANAGER_DEFAULT_MAX_STORAGE_BYTES` env, otherwise `100mb` (104857600).

Edge cases:
- If a configured value is invalid (NaN, <=0): treat as “not set”.

---

## Backend Design

### 1) Policy resolution service
Add a dedicated service, e.g. `fileManagerStoragePolicy.service.js`, responsible for:

- Loading and validating `FILE_MANAGER_STORAGE_POLICY_JSON`
- Resolving effective max upload bytes (global override vs existing)
- Resolving effective max storage bytes for a user within an org, based on:
  - orgId
  - userId
  - RBAC group memberships (`RbacGroupMember`)

Caching:
- Use `globalSettingsService` cache (already exists)
- Consider in-memory cache keyed by `{orgId,userId}` with short TTL to reduce DB queries if needed

### 2) Enforcing max upload bytes
Enforcement points:

- **Route/multer limit**: reject early based on resolved max upload bytes.
- **Service-level validation**: keep the final check in `fileManager.service.uploadFile` as a backstop.

### 3) Enforcing max storage bytes
We need to define “storage usage” for the user’s effective scope.

Locked scope:

- Max storage is **per drive**:
  - Org drive usage: `{ orgId, driveType: 'org', driveId: orgId }`
  - Group drive usage: `{ orgId, driveType: 'group', driveId: groupId }`
  - User drive usage: `{ orgId, driveType: 'user', driveId: userId }`

Usage computation approach:
- Sum `Asset.sizeBytes` for all active assets reachable by `FileEntry` within `{orgId, deletedAt:null}`.
- When enforcing per-group max storage, we still compute usage at org level but compare against the user’s effective max based on groups.

Implementation detail:

- Storage limits are **informational** and should not reject uploads.
- We still compute `usedBytes` and `overageBytes = max(0, usedBytes - maxStorageBytes)` for UI display.

Performance considerations:
- Aggregation query can be expensive; add:
  - a cached “org usage bytes” (GlobalSetting or in-memory) updated on upload/delete, or
  - a background job, or
  - a denormalized counter.

Plan proposes phased approach:
- Phase A: start with aggregation + caching (short TTL)
- Phase B (if needed): denormalized counters

### 4) Exposing effective policy to SPA
Add an API endpoint (JWT protected), e.g.

- `GET /api/file-manager/storage-policy?orgId=...`

Returns:

```json
{
  "effective": {
    "maxUploadBytes": 41943040,
    "maxStorageBytes": 1073741824,
    "source": {
      "maxUpload": "global_override|global_default|fallback",
      "maxStorage": "group|org|global|env|fallback"
    }
  },
  "usage": {
    "usedBytes": 12345
  }
}
```

---

## Admin UI Plan (File Manager Admin)

### Storage configuration section

UI components:

- Global max upload size
  - show current bytes value
  - allow input in human units (`40mb`, `1gb`) + “Convert” helper
  - store as bytes (number)

- Global max storage size
  - same human units helper

- Org table
  - list orgs (query `/api/orgs` using admin auth, if available under admin context)
  - allow setting per-org max storage

- Group table per org
  - list RBAC groups for selected org
  - allow setting per-group max storage

Persistence:
- Store all of the above in `FILE_MANAGER_STORAGE_POLICY_JSON`
- Store global override upload bytes in `FILE_MANAGER_GLOBAL_MAX_UPLOAD_BYTES`

Validation:
- Require positive integers
- Provide helper conversions and normalize case

Info text:
- Show fallback message: default max storage is `FILE_MANAGER_DEFAULT_MAX_STORAGE_BYTES` else 100mb

---

## Public SPA Plan

### Persist workspace selection
Persist:

- `orgId`
- `selectedDriveKey`

Proposed keys:
- `sb_fm_last_org_id`
- `sb_fm_last_drive_key`

Behavior:
- On mount after orgs/drives load:
  - auto-select last values if still valid
  - otherwise keep current behavior

### Display storage information

- Add a “Storage” panel showing:
  - used / max (human readable)
  - source explanation (group/org/global/env/fallback)

Data source:
- `GET /api/file-manager/storage-policy?orgId=...`

---

## Open Questions (need your confirmation)

1. **Storage scope**: Is max storage intended to be per **org** (across all drives), or per **drive** (user vs org vs group drive)?
2. **Upload scope**: Should per-org/per-group overrides also apply to max upload size, or only global?
3. **Group precedence**: You specified “pick the bigger value” when multiple groups. Confirm we should pick the **max**, not min.
4. **Usage accounting**: When a file is overwritten, should used bytes adjust to the new size (delta), and should we enforce max storage on overwrite as well?
5. **Admin data sources**: Is there an existing admin API to list orgs and groups for selection in `admin-file-manager.ejs`, or should we build dedicated admin endpoints?

---

## Milestones

1. Define settings schema + precedence + defaults (this plan)
2. Add backend policy resolution service + effective policy endpoint
3. Add enforcement for max upload + max storage in upload path
4. Build Admin UI Storage section (global/org/group)
5. Update public SPA: persistence + storage display
