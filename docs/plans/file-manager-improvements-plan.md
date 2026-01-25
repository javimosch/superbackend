# File Manager SPA Improvements Plan

## Overview
Plan to enhance the File Manager SPA with auto-refresh, folder navigation, and improved file handling.

## Requirements Analysis

### 1. Auto-refresh after upload
- **Current state**: `refreshFolder()` is called after successful upload (line 523)
- **Issue**: May not be working due to async/await or file input clearing
- **Solution**: Ensure proper await and verify refresh is triggered

### 2. Refresh on breadcrumbs navigation
- **Current state**: Breadcrumb clicks trigger `goRoot()` or path changes
- **Issue**: May need to call `refreshFolder()` after navigation changes
- **Solution**: Add watcher on `folderPath` to auto-refresh

### 3. File type and size limits
- **Current state**: Likely enforced in multer middleware
- **Requirements**: Accept any file type, max 1GB, configurable in admin UI
- **Solution**:
  - Add Global Setting: `FILE_MANAGER_MAX_UPLOAD_BYTES` (number)
  - Expose setting in the File Manager admin UI
  - Enforce per-request multer `limits.fileSize` using the setting, defaulting to 1073741824

### 4. Folders view mode
- **Current state**: Only files list view
- **Requirements**: List/Grid toggle for files
- **Solution**: Add view mode state and conditional rendering

### 5. Render intermediate slugs as folders
- **Current state**: Only shows files in current path
- **Requirements**: Show unique parent paths as clickable folders
- **Solution**: Virtual folder grouping from file paths

## Implementation Plan

### Phase 1: Fix Refresh Issues
1. Verify upload refresh works correctly
2. Add watcher on `folderPath` to refresh on navigation
3. Ensure breadcrumb navigation triggers refresh

### Phase 2: Update File Limits
1. Add Global Setting and admin UI control for `FILE_MANAGER_MAX_UPLOAD_BYTES`
2. Update upload middleware in `src/routes/fileManager.routes.js` to read the setting and apply multer `limits.fileSize`
3. Remove any file type restrictions (accept any file type)
4. Default max file size to 1GB (1073741824 bytes)

### Phase 3: Virtual Folders
1. Create computed property to extract unique parent paths
2. Render folders before files in the table
3. Add folder icons and click handlers
4. Update navigation to handle folder clicks

### Phase 4: View Modes
1. Add `viewMode` ref ('list' | 'grid')
2. Create toggle button in toolbar
3. Implement grid view with card layout
4. Maintain list view as default

## Technical Details

### Virtual Folder Algorithm
```javascript
const folders = computed(() => {
  const pathSegments = new Set();
  files.value.forEach(file => {
    const relativePath = file.path.replace(currentPath.value, '').split('/');
    if (relativePath.length > 1) {
      pathSegments.add(relativePath[1]);
    }
  });
  return Array.from(pathSegments).sort();
});
```

### File Upload Limits
Update in `src/routes/fileManager.routes.js`:
```javascript
// Remove fileFilter for type restrictions
// Update limits: { fileSize: settingOrDefaultBytes } // default 1GB
```

### Path Navigation
- Add watcher on `folderPath`
- Trigger `refreshFolder()` on path change
- Update breadcrumb navigation to be reactive

## Open Questions
1. Should empty folders be shown? (Virtual approach won't show empty folders)
2. How to handle folder creation in future? (Add type field to FileEntry later)
3. Should grid view show file previews? (Use thumbnails for images)
4. Performance with many files? (Consider pagination)

## Priority Order
1. Fix refresh issues (critical UX)
2. Update file limits (easy win)
3. Virtual folders (core feature)
4. View modes (nice-to-have)
