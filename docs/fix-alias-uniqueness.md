# Fix: Alias Uniqueness Error in Dual-Write System

## Problem

The `/compact` command was failing with the error:
```
Error: Alias must be unique and not conflict with existing slugs or aliases
```

## Root Cause

The alias format `agent-history-{agentId}:{chatId}` (with colon) was being normalized by the JsonConfig service to `agent-history-{agentId}-{chatId}` (with hyphen). This caused issues because:

1. When searching for an existing history JsonConfig, the code was searching for the un-normalized alias (with colon)
2. The stored alias was normalized (with hyphen)
3. This mismatch caused the `getJsonConfigValueBySlug` function to not find the existing entry
4. When creating a new entry, the normalized alias conflicted with an existing slug or alias

## Solution

1. **Changed alias format**: Changed from `agent-history-{agentId}:{chatId}` to `agent-history-{agentId}-{chatId}`
2. **Added normalization**: Added explicit normalization of the key before searching in `jsonConfigsService.getJsonConfig()`
3. **Updated functions**: Updated `saveHistoryToBothStorages()`, `loadHistoryFromBothStorages()`, and `migrateCacheOnlyHistories()` to use normalized keys

## Changes Made

### `getHistoryJsonConfigKey()` function
- Changed from: `return `${HISTORY_JSON_CONFIG_PREFIX}${agentId}:${chatId}`;`
- Changed to: `return `${HISTORY_JSON_CONFIG_PREFIX}${agentId}-${chatId}`;`

### `saveHistoryToBothStorages()` function
- Added normalization: `const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');`
- Use normalized key for `jsonConfigsService.getJsonConfig()`

### `loadHistoryFromBothStorages()` function
- Added normalization: `const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');`
- Use normalized key for `jsonConfigsService.getJsonConfig()`

### `migrateCacheOnlyHistories()` function
- Added normalization: `const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');`
- Use normalized key for `jsonConfigsService.getJsonConfig()`

## Testing

The normalization has been verified to match the `normalizeAlias` function from `jsonConfigs.service.js`:

```javascript
// Original key: agent-history-698c5cdf0b053b372380162c-tui-1770827148368
// Normalized key: agent-history-698c5cdf0b053b372380162c-tui-1770827148368
// Alias normalized: agent-history-698c5cdf0b053b372380162c-tui-1770827148368
// ✅ Normalization matches!
```

## Impact

- **Cache keys**: No change (still use colon format)
- **JSON Config aliases**: Now use hyphen format (more consistent)
- **Existing data**: Migration function handles conversion from old format
- **Future sessions**: Will automatically use the new format

## Notes

- The cache layer still uses the colon format for keys (e.g., `agentId:chatId`)
- Only JSON Config aliases have been changed to use hyphens
- This change is backward compatible because the migration function can handle both formats