# Console Manager

## Overview
Console Manager is a backend subsystem that wraps the global Node.js `console` methods and provides:

- Centralized enable/disable control per auto-registered console entry.
- Tagging and tag-based filtering to quickly enable a focused subset of logs.
- Optional persistence of log occurrences to cache and/or database.
- Bulk operations including enable/disable, tag management, and deletion of entries.
- Environment variable and global settings control for complete enable/disable of console manager.

## Control Methods

### Environment Variable Control
Set `CONSOLE_MANAGER_ENABLED` environment variable to control console manager initialization:

- `CONSOLE_MANAGER_ENABLED=true` (default) - Console manager initializes and overrides console methods
- `CONSOLE_MANAGER_ENABLED=false` - Console manager does not initialize, no console override occurs

**Priority**: Environment variable takes highest priority over global settings.

**Restart Required**: Yes - environment variable is read at startup only.

### Global Settings Control
Use the `CONSOLE_MANAGER_ENABLED` global setting for runtime control:

- **Key**: `CONSOLE_MANAGER_ENABLED`
- **Values**: `"true"` or `"false"`
- **Default**: `"true"`

**Priority**: Global settings are used when environment variable is not set.

**Restart Required**: Yes - global settings are loaded once at startup.

### UI Control
The Console Manager admin UI provides a toggle in the Config tab under "Global Settings" section:

- Updates the `CONSOLE_MANAGER_ENABLED` global setting
- Shows current status and restart requirement
- Provides user-friendly feedback for setting changes

**Priority**: UI toggle uses global settings (same as direct global setting control).

**Restart Required**: Yes - requires server restart to take effect.

### Control Priority
1. **Environment Variable** (`CONSOLE_MANAGER_ENABLED`) - Highest priority
2. **Global Settings** (`CONSOLE_MANAGER_ENABLED`) - Used when env var not set
3. **Default** - `true` (console manager enabled) - Fallback

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
- `GET /global-setting` - Get global settings status
- `PUT /global-setting` - Update global settings

### Global Settings API
`GET /api/admin/console-manager/global-setting`

Returns the current global setting status:
```json
{
  "enabled": true
}
```

`PUT /api/admin/console-manager/global-setting`

Updates the global setting (requires restart):

Request body:
```json
{
  "enabled": true
}
```

Response:
```json
{
  "ok": true,
  "enabled": true,
  "message": "Console manager global setting updated. Restart required for changes to take effect."
}
```

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
- Global Settings section for enabling/disabling console manager (requires restart).

Route:
- `/admin/console-manager`

### Global Settings Section
Located in the Config tab, provides:
- Toggle to enable/disable console manager initialization
- Current status display
- Restart requirement messaging
- Integration with Global Settings system

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
