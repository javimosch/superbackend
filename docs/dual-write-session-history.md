# Dual-Write Session History System

## Overview

Implemented a dual-write system for agent session history to improve persistence and reliability. Previously, session history was stored only in the cache layer (with 1-hour TTL), which caused issues when sessions were switched or cache expired.

## Architecture

### Storage Layers

1. **Cache Layer** (Fast Access)
   - Storage: MongoDB CacheEntry or Redis (depending on configuration)
   - TTL: 1 hour
   - Purpose: Fast access for active sessions
   - Namespace: `agent:history`

2. **JSON Config** (Persistent Storage)
   - Storage: MongoDB JsonConfig collection
   - TTL: None (persistent)
   - Purpose: Long-term persistence for session history
   - Key format: `agent-history-{agentId}-{chatId}`

### Dual-Write Pattern

**Write Operations:**
1. Always write to both cache layer and JSON Config
2. Cache write includes 1-hour TTL
3. JSON Config write stores complete history data structure

**Read Operations:**
1. Check cache first (fastest)
2. If cache miss, fallback to JSON Config
3. If JSON Config found, rehydrate cache for future fast access

## Implementation Details

### New Functions Added

1. **`saveHistoryToBothStorages(agentId, chatId, history)`**
   - Saves history to cache layer with 1-hour TTL
   - Saves history to JSON Config (persistent)
   - Updates existing JSON Config or creates new one

2. **`loadHistoryFromBothStorages(agentId, chatId)`**
   - Tries cache layer first
   - Falls back to JSON Config if cache miss
   - Rehydrates cache from JSON Config for future fast access
   - Returns empty array if no history found

3. **`migrateCacheOnlyHistories()`**
   - Migration utility to convert existing cache-only histories
   - Scans all cache entries in `agent:history` namespace
   - Creates JSON Config entries for each session
   - Reports migration statistics

### Modified Functions

1. **`processMessage()`**
   - Updated to use `loadHistoryFromBothStorages()` for reading history
   - Updated to use `saveHistoryToBothStorages()` for writing history

2. **`compactSession()`**
   - Updated to use `loadHistoryFromBothStorages()` for reading history
   - Updated to use `saveHistoryToBothStorages()` for writing history

### Data Structure

**JSON Config Entry:**
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
  "size": 3,
  "migrated": true
}
```

**Key Format:**
- Cache key: `agentId:chatId` (with colon)
- JSON Config alias: `agent-history-{agentId}-{chatId}` (with hyphens)
- **Note:** Alias uses hyphens instead of colons to avoid alias normalization issues

## Benefits

1. **Session Switching**: Sessions can be switched without losing history
2. **Cache Expiration**: History persists even when cache expires
3. **Reliability**: Dual storage provides redundancy
4. **Performance**: Cache provides fast access, JSON Config provides persistence
5. **Migration**: Existing cache-only histories can be migrated

## Usage

### Running Migration

```javascript
const agentService = require('./src/services/agent.service');

// Run migration once to convert existing cache-only histories
const result = await agentService.migrateCacheOnlyHistories();
console.log(`Migrated: ${result.migrated}, Failed: ${result.failed}`);
```

### Testing Session Switching

1. Start a session and send messages
2. Switch to a different session using `/sessions` in the agent chat
3. Switch back to the original session
4. History should still be available (loaded from JSON Config)

## Error Handling

- If cache fails, system falls back to JSON Config
- If JSON Config fails, system returns empty history
- All errors are logged for debugging
- Migration failures are counted and reported

## Migration Path

1. **Before**: History stored only in cache (1-hour TTL)
2. **After**: History stored in both cache (1-hour TTL) and JSON Config (persistent)
3. **Migration**: Run `migrateCacheOnlyHistories()` once to convert existing data

## Notes

- The migration utility should be run once to convert existing cache-only histories
- After migration, all new sessions will use the dual-write system automatically
- The system is backward compatible - if JSON Config doesn't exist, it will create it
- The cache layer still provides fast access for active sessions