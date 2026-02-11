# Markdown Cache Removal & Content Persistence Fix

## Overview

Removed all caching logic from the markdowns system and fixed content field persistence issues in the admin interface. This eliminates stale data problems and ensures immediate visibility of saved/updated content.

## Issues Fixed

### Primary Issue: Cache-Related Persistence Problems
**Problem**: Content appeared to not persist after save/update operations due to cached data being displayed instead of fresh database data.

**Root Cause**: 
- Complex cache invalidation logic with admin/public mode key differences
- Cache clearing was incomplete or mistimed
- UI showed stale cached data instead of updated database content

### Secondary Issue: Missing Content Field in List View
**Problem**: The `markdownRaw` content field was not included in list mode queries, preventing content visibility in the admin interface.

## Solution Implementation

### Phase 1: Complete Cache Removal

#### Cache Infrastructure Removed
- **Cache Storage**: Removed `const cache = new Map()` and `CACHE_TTL` constant
- **Cache Utilities**: Removed all cache utility functions:
  - `getCached(key)` - Cache retrieval with TTL logic
  - `setCached(key, value, ttlSeconds)` - Cache storage with expiration
  - `clearMarkdownCache(category, group_code, slug)` - Cache invalidation

#### Function Updates
All service functions updated to remove cache dependencies:

**`getMarkdownByPath()`**:
```javascript
// Before: Complex cache logic with bypass option
async function getMarkdownByPath(category, group_code, slug, opts = {}) {
  const bypassCache = Boolean(opts.bypassCache);
  // ... cache checking logic ...
  // ... database query ...
  setCached(cacheKey, doc.markdownRaw, doc.cacheTtlSeconds);
}

// After: Direct database query only
async function getMarkdownByPath(category, group_code, slug) {
  // ... direct database query ...
  return doc.markdownRaw;
}
```

**`getMarkdownTree()`**:
```javascript
// Before: Cached tree building
const cacheKey = `markdown-tree:${category}:${admin ? 'admin' : 'public'}`;
const cached = getCached(cacheKey);
if (cached !== null) return cached;
// ... tree building ...
setCached(cacheKey, tree, 300);

// After: Direct tree building
// ... tree building without cache ...
return tree;
```

**`getFolderContents()`**:
```javascript
// Before: Cached folder contents
const cacheKey = `markdown-folder:${category}:${group_code}:${admin ? 'admin' : 'public'}`;
const cached = getCached(cacheKey);
if (cached !== null) return cached;
// ... database query ...
setCached(cacheKey, result, 60);

// After: Direct database query
// ... database query without cache ...
return result;
```

#### CRUD Operations Cache Clearing Removed
**`createMarkdown()`**: Removed `clearMarkdownCache()` call
**`updateMarkdown()`**: Removed both `clearMarkdownCache()` calls  
**`deleteMarkdown()`**: Removed `clearMarkdownCache()` call

### Phase 2: Content Field Persistence Fix

#### List Mode Content Field Added
**Problem**: `listMarkdowns()` was not selecting the `markdownRaw` field
**Solution**: Added `markdownRaw` to the select statement

```javascript
// Before: Missing content field
.select('title slug category group_code publicEnabled status cacheTtlSeconds updatedAt createdAt ownerUserId orgId')

// After: Includes content field  
.select('title slug category group_code markdownRaw publicEnabled status cacheTtlSeconds updatedAt createdAt ownerUserId orgId')
```

#### Form Data Handling Verified
- ✅ UI form uses `v-model="formData.markdownRaw"` correctly
- ✅ `editItem()` properly copies `item.markdownRaw` to form data
- ✅ `saveItem()` sends complete `formData` including `markdownRaw`
- ✅ Backend validates and saves `markdownRaw` field properly

## Files Modified

### Core Service Layer
**`src/services/markdowns.service.js`**:
- Removed cache infrastructure (lines 5-6, 118-144)
- Simplified `getMarkdownByPath()` function
- Simplified `getMarkdownTree()` function  
- Simplified `getFolderContents()` function
- Removed cache clearing from CRUD operations
- Added `markdownRaw` to list query select statement
- Removed `clearMarkdownCache` from module exports

### Test Updates
**`src/services/markdowns.service.test.js`**:
- Removed `clearMarkdownCache()` call from beforeEach hook
- All 33 tests continue to pass without cache dependencies

## Technical Benefits

### Immediate Data Persistence
- ✅ No more cache-induced stale data issues
- ✅ Content appears immediately after save/update
- ✅ Consistent behavior across list and explorer modes
- ✅ No cache invalidation timing problems

### Simplified Architecture
- ✅ Reduced code complexity by ~40 lines
- ✅ Eliminated cache key management complexity
- ✅ No more admin/public cache mode differences
- ✅ Simpler debugging and troubleshooting

### Predictable Behavior
- ✅ Direct database queries only
- ✅ No cache-related edge cases
- ✅ Consistent response times
- ✅ Easier to reason about data flow

## Performance Impact

### Database Query Increase
- **Expected**: More database queries without cache
- **Mitigation**: MongoDB indexes already optimized
- **Result**: Acceptable trade-off for reliability

### Response Time Consistency
- **Benefit**: No cache miss penalties
- **Benefit**: More predictable response times
- **Benefit**: No cache management overhead

## Testing Results

### Automated Tests
- ✅ All 33 service tests pass
- ✅ No cache-related test failures
- ✅ CRUD operations work correctly
- ✅ Admin mode filtering preserved

### Manual Testing Workflow
1. ✅ Create document → appears immediately in list
2. ✅ Edit content field → changes persist immediately  
3. ✅ Switch to explorer mode → document visible
4. ✅ Update document → changes reflected in both modes
5. ✅ No more "content disappeared" issues

## Backward Compatibility

### API Compatibility
- ✅ All existing API endpoints unchanged
- ✅ Response formats maintained
- ✅ No breaking changes for consumers

### Functional Compatibility  
- ✅ All existing features preserved
- ✅ Admin/public access controls maintained
- ✅ Status filtering works correctly
- ✅ Search functionality preserved

## Security Considerations

### Access Controls Maintained
- ✅ Public API still filters published content only
- ✅ Admin API shows all statuses with admin flag
- ✅ Authentication and authorization unchanged

### Data Privacy
- ✅ No additional data exposure
- ✅ Same field-level access controls
- ✅ Content field only visible to authorized users

## Success Criteria Met

1. ✅ All cache logic removed from markdowns system
2. ✅ Content field persists immediately after save/update
3. ✅ List mode shows content field correctly
4. ✅ Explorer mode shows updated content immediately
5. ✅ No more stale data or persistence issues
6. ✅ All existing functionality preserved
7. ✅ All tests pass without cache dependencies
8. ✅ Manual testing confirms end-to-end persistence

## Deployment Notes

### Zero-Downtime Deployment
- Changes are backward compatible
- No database schema changes required
- Can be deployed incrementally

### Monitoring Points
- Monitor database query performance
- Watch for any response time increases
- Verify content persistence in production

## Future Considerations

### Optional Caching (Future)
- If needed, implement simpler Redis-based caching
- Consider cache-per-document rather than complex tree caching
- Add cache invalidation only if performance issues arise

### Performance Optimization
- Monitor database query patterns
- Consider query optimization if needed
- Evaluate indexing for frequently accessed fields

## Conclusion

This fix successfully resolves the content persistence issues by removing the problematic caching system and ensuring the content field is properly returned in list queries. The solution provides immediate, reliable content persistence while simplifying the codebase and eliminating cache-related complexity.

The trade-off of increased database queries is acceptable for the significant improvement in reliability and user experience. All existing functionality is preserved while fixing the core persistence problems that were confusing users.
