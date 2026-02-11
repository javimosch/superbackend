# Cache-Layer Removal for Session History

## Problem

The double-write system (cache-layer + JSON Config) was causing serious size limitations for persisting session history:

```
Error: Value exceeds max entry size
    at CacheLayerService.set (/home/jarancibia/ai/saas-backend/src/services/cacheLayer.service.js:340:27)
```

The cache layer had a maximum entry size limit that was being exceeded by the session history data.

## Solution

Removed the cache-layer (double write) completely. Session history is now stored only in JSON Config (persistent storage).

## Changes Made

### 1. `agentHistory.service.js`
- **Removed**: `cacheLayer` import
- **Removed**: `HISTORY_NAMESPACE` constant
- **Removed**: `HISTORY_JSON_CONFIG_PREFIX` constant (kept, but not used with cache layer)
- **Updated function names**:
  - `saveHistoryToBothStorages()` → `saveHistory()`
  - `loadHistoryFromBothStorages()` → `loadHistory()`
- **Removed cache-layer operations** from both functions
- **Simplified logic**: Only JSON Config operations remain
- **Deprecated**: `migrateCacheOnlyHistories()` function (returns `{ migrated: 0, failed: 0, deprecated: true }`)

### 2. `agent.service.js`
- **Removed**: `cacheLayer` import
- **Removed**: `HISTORY_NAMESPACE` constant (no longer needed)
- **Removed**: `HISTORY_JSON_CONFIG_PREFIX` constant (no longer needed)
- **Updated calls**:
  - `saveHistoryToBothStorages()` → `saveHistory()`
  - `loadHistoryFromBothStorages()` → `loadHistory()`

### 3. Documentation Updates
- **Updated**: `docs/dual-write-session-history.md` → Now describes single-write system
- **Updated**: `docs/fix-alias-uniqueness.md` → Updated references to function names
- **Created**: `docs/cache-layer-removal-session-history.md` → This document

## Benefits

1. **Size Limitation Resolved**: No more cache layer size restrictions
2. **Simplified Architecture**: Single storage system reduces complexity
3. **Improved Reliability**: No dual-write synchronization issues
4. **Better Performance**: No cache misses or rehydration overhead
5. **Easier Maintenance**: Fewer moving parts to manage

## Data Structure

The JSON Config entry structure remains unchanged:
```json
{
  "agentId": "agent-uuid",
  "chatId": "chat-uuid",
  "history": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "lastUpdated": "2026-02-11T17:00:00.000Z",
  "size": 3
}
```

## Migration

**No migration required** - existing JSON Config entries will continue to work. The cache-layer was only used for fast access, not for persistence.

## Backward Compatibility

- Existing JSON Config entries remain unchanged
- No data loss from removing cache layer
- System will continue to work with existing history data

## Testing

The changes have been verified:
1. ✅ Syntax validation passed for both modified files
2. ✅ No TypeScript/LSP diagnostics found
3. ✅ All references to old function names updated
4. ✅ Documentation updated to reflect changes
5. ✅ Unused imports removed

## Usage

The usage remains the same for application code:
```javascript
// Save history (now only writes to JSON Config)
await agentHistoryService.saveHistory(agentId, chatId, history);

// Load history (now only reads from JSON Config)
const history = await agentHistoryService.loadHistory(agentId, chatId);
```

## Notes

- The cache layer still exists for other purposes, but is no longer used for session history
- Session history now has no size limitations (beyond MongoDB document size limits)
- History persists indefinitely in JSON Config
- No TTL is applied to session history