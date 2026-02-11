# Single-Write Session History System

## Overview

The cache-layer (double write) has been removed due to serious size limitations for persisting session history. History is now stored only in JSON Config (persistent storage).

## Architecture

### Storage Layer

**JSON Config** (Persistent Storage)
- Storage: MongoDB JsonConfig collection
- TTL: None (persistent)
- Purpose: Long-term persistence for session history
- Key format: `agent-history-{agentId}-{chatId}`

### Single-Write Pattern

**Write Operations:**
1. Always write to JSON Config only
2. JSON Config write stores complete history data structure

**Read Operations:**
1. Always read from JSON Config
2. Returns empty array if no history found

## Implementation Details

### New Functions Added

1. **`saveHistory(agentId, chatId, history)`**
   - Saves history to JSON Config (persistent)
   - Updates existing JSON Config or creates new one

2. **`loadHistory(agentId, chatId)`**
   - Reads history from JSON Config
   - Returns empty array if no history found

3. **`migrateCacheOnlyHistories()`**
   - Deprecated - no longer used
   - Returns `{ migrated: 0, failed: 0, deprecated: true }`

### Modified Functions

1. **`processMessage()`**
   - Updated to use `loadHistory()` for reading history
   - Updated to use `saveHistory()` for writing history

2. **`compactSession()`**
   - Updated to use `loadHistory()` for reading history
   - Updated to use `saveHistory()` for writing history

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
  "size": 3
}
```

**Key Format:**
- JSON Config alias: `agent-history-{agentId}-{chatId}` (with hyphens)
- **Note:** Alias uses hyphens instead of colons to avoid alias normalization issues

## Benefits

1. **Size Limitation Resolved**: No more cache layer size restrictions
2. **Reliability**: Single persistent storage eliminates dual-write complexity
3. **Simplicity**: Easier to maintain and debug
4. **Persistence**: History persists indefinitely in JSON Config

## Usage

### Migrating from Dual-Write System

The migration function is now deprecated. Existing JSON Config entries will continue to work.

### Testing

1. Start a session and send messages
2. History should be saved to JSON Config
3. Session history persists indefinitely
4. No cache layer size limitations

## Error Handling

- All errors are logged for debugging
- System returns empty array if JSON Config read fails
- Errors during save are thrown to caller

## Migration Path

1. **Before**: History stored in both cache (1-hour TTL) and JSON Config (persistent)
2. **After**: History stored only in JSON Config (persistent)
3. **Action Required**: Remove any cache-layer writes from your code

## Notes

- The cache layer is no longer used for history storage
- History is now stored only in JSON Config with no size limitations
- The system is backward compatible - existing JSON Config entries will continue to work
- No migration is needed for existing history data