# Fix: Alias Uniqueness Error in Single-Write System

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
3. **Updated functions**: Updated `saveHistory()`, `loadHistory()`, and `migrateCacheOnlyHistories()` to use normalized keys

## Changes Made

### `getHistoryJsonConfigKey()` function
- Changed from: `return `${HISTORY_JSON_CONFIG_PREFIX}${agentId}:${chatId}`;`
- Changed to: `return `${HISTORY_JSON_CONFIG_PREFIX}${agentId}-${chatId}`;`

### `saveHistory()` function
- Added normalization: `const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');`
- Use normalized key for `jsonConfigsService.getJsonConfig()`

### `loadHistory()` function
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

- **Cache keys**: No longer used for history (cache-layer removed)
- **JSON Config aliases**: Use hyphen format (consistent with normalization)
- **Existing data**: Already using hyphen format (no migration needed)
- **Future sessions**: Will automatically use the new format

## Notes

- The cache layer is no longer used for history storage
- JSON Config aliases use hyphens (more consistent)
- This change is backward compatible with existing JSON Config entries