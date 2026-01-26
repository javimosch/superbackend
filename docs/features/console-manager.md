# Console Manager

## Overview
Console Manager is a backend subsystem that wraps the global Node.js `console` methods and provides:

- Centralized enable/disable control per auto-registered console entry.
- Tagging and tag-based filtering to quickly enable a focused subset of logs.
- Optional persistence of log occurrences to cache and/or database.
- Bulk operations including enable/disable, tag management, and deletion of entries.

## Runtime behavior

### Console override layering
Console Manager is initialized after existing console wrappers so it composes with them:

- `consoleOverride` (stdout + file in non-production)
- `hookConsoleError` (error aggregation)
- `consoleManager` (entry registry + gating + optional persistence)

Console Manager stores references to the then-current `console` methods and forwards to those methods when output is enabled.

### Entry detection and hashing
Each `console.debug/log/info/warn/error` call is mapped to a Console Entry signature.

Signature inputs:
- Method (`debug|log|info|warn|error`)
- Normalized message template (UUID/ObjectId/large-number normalization)
- Top stack frame (to reduce collisions between similar messages)

The signature is hashed with SHA-256 and truncated to 32 hex characters.

### Enable/disable behavior
- Enabled entry: forwards to the previous console implementation, so output reaches stdout/stderr.
- Disabled entry: does not forward to stdout/stderr.
- Disabled `console.error`: still emits an occurrence into the error aggregation layer (best-effort).

### Low-footprint persistence
Persistence is best-effort and designed not to block the calling path.

- Writes are queued and drained asynchronously.
- Queue is bounded; older tasks are dropped when capacity is exceeded.

## Configuration
Configuration is stored and managed via the JSON Configs system using alias `console-manager`.

Config fields:
- `enabled` (boolean)
- `defaultEntryEnabled` (boolean)
- `defaults.persist.cache` (boolean)
- `defaults.persist.db` (boolean)
- `defaults.persist.warnErrorToCacheDb` (boolean)
- `cache.enabled`, `cache.ttlSeconds`, `cache.namespace`
- `db.enabled`, `db.ttlDays`, `db.sampleRatePercent`
- `performance.maxArgChars`, `performance.maxArgsSerialized`

When config defaults are updated via the Console Manager admin UI, defaults are applied retroactively to existing entries that have not been explicitly overridden.

## Data model

### ConsoleEntry
Collection: `console_entries`

Stores the registry of unique console entry signatures with:
- `hash`, `method`, `messageTemplate`, `topFrame`
- `enabled` plus explicitness tracking
- persistence flags plus explicitness tracking
- `tags`
- `countTotal`, `firstSeenAt`, `lastSeenAt`, `lastSample`

### ConsoleLog
Collection: `console_logs`

Stores persisted log occurrences when DB persistence is enabled:
- `entryHash`, `method`, `createdAt`, `expiresAt`
- `message`, `argsPreview`
- `tagsSnapshot`

An expiry index is maintained on `expiresAt`.

## Retention
Console logs are retained based on `db.ttlDays`.

A daily cron job performs best-effort cleanup:
- ScriptDefinition: `console-manager-retention`
- CronJob: `Console Manager Retention`

The script reads `db.ttlDays` from the JSON config and deletes records older than the retention window.

## Admin API
All endpoints are behind basic auth.

Base path:
- `/api/admin/console-manager`

Endpoints:
- `GET /config`
- `PUT /config`
- `GET /entries`
- `PUT /entries/bulk-enable`
- `PUT /entries/bulk-tags`
- `DELETE /entries/bulk-delete`
- `GET /tags`
- `GET /logs`

### Bulk Delete API
`DELETE /api/admin/console-manager/entries/bulk-delete`

Request body:
```json
{
  "hashes": ["hash1", "hash2"],
  "deleteLogs": true
}
```

Response:
```json
{
  "ok": true,
  "deletedEntries": 2,
  "deletedLogs": 47
}
```

## Admin UI
A dedicated admin page provides:
- Entries view with selection, bulk enable/disable, tag management, and deletion.
- Logs view with pagination and filtering.
- Config view with a form UI backed by JSON Configs.

Route:
- `/admin/console-manager`

### Bulk Operations
- **Enable/Disable**: Toggle output for selected entries
- **Tag Management**: Add or remove tags from selected entries
- **Delete**: Remove selected entries with optional log deletion
  - Confirmation modal with warning about permanent deletion
  - Checkbox option to also delete associated logs
  - Loading states and success feedback

## Bulk Delete Feature
The bulk delete functionality allows administrators to:

1. Select multiple console entries using checkboxes
2. Click "Delete selected" button
3. Confirm deletion in modal dialog
4. Optionally choose to delete associated logs
5. Execute deletion with real-time feedback

### Safety Features
- Confirmation modal prevents accidental deletion
- Clear indication of destructive action
- Option to preserve logs even when deleting entries
- Selection validation prevents empty operations

### Technical Implementation
- Backend uses MongoDB `deleteMany` for efficient bulk operations
- Frontend uses Vue.js with reactive state management
- Atomic database operations ensure data consistency
- Proper error handling and user feedback throughout the process
