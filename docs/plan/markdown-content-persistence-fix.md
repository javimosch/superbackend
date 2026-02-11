# Markdown Content Persistence Fix Plan

## Issue Analysis

The user reports that content is still not being persisted despite the previous admin mode fixes. After investigation, I've identified the root cause and several contributing issues.

## Root Cause: Cache Invalidation Problem

### Primary Issue: Admin Cache Keys Not Cleared

**Problem**: The `clearMarkdownCache()` function is using old cache key format that doesn't include admin mode suffixes.

**Current Cache Keys (with admin mode)**:
- Tree: `markdown-tree:${category}:${admin ? 'admin' : 'public'}`
- Folder: `markdown-folder:${category}:${group_code}:${admin ? 'admin' : 'public'}`

**Current Cache Clearing Function**:
```javascript
function clearMarkdownCache(category, group_code, slug) {
  const keysToDelete = [];
  
  // Clear all possible cache keys for this path
  keysToDelete.push(`markdown:${category}:${group_code || ''}:${slug}`);
  keysToDelete.push(`markdown-tree:${category}`);           // ❌ Missing admin mode
  keysToDelete.push(`markdown-folder:${category}:${group_code || ''}`); // ❌ Missing admin mode
  
  keysToDelete.forEach(key => cache.delete(key));
}
```

**Impact**: When documents are saved/updated, the admin cache entries are not cleared, causing the admin interface to show stale cached data.

## Secondary Issues

### Issue 1: Inconsistent Cache Key Generation

**Problem**: Cache key generation is scattered across functions and may not be consistent.

**Locations**:
- `getMarkdownTree()` - generates tree cache keys
- `getFolderContents()` - generates folder cache keys  
- `clearMarkdownCache()` - generates keys to clear

**Risk**: Inconsistent key generation leads to cache misses or stale data.

### Issue 2: Cache Scope Too Broad

**Problem**: Current cache clearing removes entire category trees/folders instead of specific affected entries.

**Current Behavior**: Clearing one document clears entire category tree and folder
**Better Behavior**: Clear only affected cache entries, with optional full clear

## Solution Plan

### Phase 1: Fix Cache Key Management

#### 1.1 Create Centralized Cache Key Functions

```javascript
// New utility functions
function getTreeCacheKey(category, isAdmin = false) {
  return `markdown-tree:${category}:${isAdmin ? 'admin' : 'public'}`;
}

function getFolderCacheKey(category, group_code, isAdmin = false) {
  return `markdown-folder:${category}:${group_code || ''}:${isAdmin ? 'admin' : 'public'}`;
}

function getDocumentCacheKey(category, group_code, slug) {
  return `markdown:${category}:${group_code || ''}:${slug}`;
}
```

#### 1.2 Update Cache Key Usage

**Files to Update**:
- `src/services/markdowns.service.js` - `getMarkdownTree()`, `getFolderContents()`, `clearMarkdownCache()`

**Changes**:
- Replace hardcoded cache keys with utility functions
- Ensure consistent key generation across all functions

#### 1.3 Fix Cache Clearing Function

```javascript
function clearMarkdownCache(category, group_code, slug, options = {}) {
  const { clearAll = false, isAdmin = false } = options;
  const keysToDelete = [];
  
  // Always clear the specific document
  keysToDelete.push(getDocumentCacheKey(category, group_code, slug));
  
  if (clearAll) {
    // Clear entire category for both admin and public
    keysToDelete.push(getTreeCacheKey(category, true));   // admin
    keysToDelete.push(getTreeCacheKey(category, false));  // public
    keysToDelete.push(getFolderCacheKey(category, group_code, true));   // admin
    keysToDelete.push(getFolderCacheKey(category, group_code, false));  // public
  } else {
    // Clear only for the relevant mode
    keysToDelete.push(getTreeCacheKey(category, isAdmin));
    keysToDelete.push(getFolderCacheKey(category, group_code, isAdmin));
  }
  
  keysToDelete.forEach(key => cache.delete(key));
}
```

### Phase 2: Update Cache Clearing Calls

#### 2.1 Update Service Functions

**Functions to Update**:
- `createMarkdown()` - Clear cache after creation
- `updateMarkdown()` - Clear cache after update  
- `deleteMarkdown()` - Clear cache after deletion

**Changes**:
- Pass admin mode flag to cache clearing
- Use appropriate cache clearing strategy (specific vs all)

#### 2.2 Update Controllers

**Files to Update**:
- `src/controllers/adminMarkdowns.controller.js`

**Changes**:
- Pass admin mode information to service layer for cache clearing
- Ensure cache clearing uses correct admin mode

### Phase 3: Add Cache Debugging

#### 3.1 Add Cache Logging

**Purpose**: Help debug cache issues in development

**Implementation**:
```javascript
function clearMarkdownCache(category, group_code, slug, options = {}) {
  const { clearAll = false, isAdmin = false } = options;
  const keysToDelete = [];
  
  // ... key generation logic ...
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`Clearing cache keys:`, keysToDelete);
  }
  
  keysToDelete.forEach(key => cache.delete(key));
}
```

#### 3.2 Add Cache Status Endpoint

**Purpose**: Allow debugging cache state

**Implementation**: Add admin endpoint to view cache contents

### Phase 4: Testing & Validation

#### 4.1 Unit Tests

**Test Coverage**:
- Cache key generation functions
- Cache clearing with admin mode
- Cache clearing strategies (specific vs all)

#### 4.2 Integration Tests

**Test Scenarios**:
- Create document → verify cache cleared
- Update document → verify cache cleared  
- Delete document → verify cache cleared
- Admin vs public cache isolation

#### 4.3 Manual Testing

**Test Workflow**:
1. Create draft document in list mode
2. Verify document appears immediately
3. Switch to explorer mode
4. Verify document appears in tree
5. Edit document
6. Verify changes appear in both modes
7. Test with different statuses (draft/published/archived)

## Implementation Details

### File Changes Required

#### `src/services/markdowns.service.js`

**Additions**:
- `getTreeCacheKey()` function
- `getFolderCacheKey()` function  
- `getDocumentCacheKey()` function
- Enhanced `clearMarkdownCache()` function

**Modifications**:
- `getMarkdownTree()` - use new cache key function
- `getFolderContents()` - use new cache key function
- `createMarkdown()` - pass admin mode to cache clearing
- `updateMarkdown()` - pass admin mode to cache clearing
- `deleteMarkdown()` - pass admin mode to cache clearing

#### `src/controllers/adminMarkdowns.controller.js`

**Modifications**:
- Pass admin mode information to service functions for cache clearing

#### `src/services/markdowns.service.test.js`

**Additions**:
- Tests for new cache key functions
- Tests for enhanced cache clearing
- Tests for admin mode cache isolation

## Expected Outcomes

### Primary Goal
- ✅ Content persistence works correctly in both list and explorer modes
- ✅ Cache is properly invalidated after save/update/delete operations
- ✅ Admin and public cache isolation maintained

### Secondary Benefits
- ✅ Better cache management and debugging capabilities
- ✅ More granular cache clearing (reduced performance impact)
- ✅ Consistent cache key generation across the codebase

## Risk Mitigation

### Backward Compatibility
- ✅ All existing API endpoints remain unchanged
- ✅ Cache key format change is internal only
- ✅ No breaking changes for public API consumers

### Performance
- ✅ More targeted cache clearing reduces unnecessary cache misses
- ✅ Centralized cache key generation improves consistency
- ✅ Debug logging only enabled in development

### Rollback Plan
- ✅ Changes are isolated to service layer
- ✅ Can revert to old cache clearing logic if needed
- ✅ No database schema changes required

## Success Criteria

1. ✅ Draft documents appear immediately after save in list mode
2. ✅ Draft documents appear in explorer mode tree after save
3. ✅ Document updates are reflected immediately in both modes
4. ✅ Cache is properly cleared for both admin and public modes
5. ✅ No stale data shown after CRUD operations
6. ✅ All existing tests continue to pass
7. ✅ New cache management tests pass
8. ✅ Manual testing confirms persistence works end-to-end

## Implementation Priority

**High Priority** (Core Issue):
1. Fix cache clearing function to include admin mode keys
2. Update service functions to pass admin mode for cache clearing
3. Test and validate persistence works

**Medium Priority** (Improvements):
4. Add centralized cache key functions
5. Add debugging capabilities
6. Enhance test coverage

**Low Priority** (Future):
7. Add cache status endpoint
8. Optimize cache clearing strategies
9. Add cache metrics and monitoring

This plan addresses the core persistence issue while improving the overall cache management system for better reliability and maintainability.
