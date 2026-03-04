# Tab Limitation Feature

## Overview

The admin dashboard now supports limiting the maximum number of open tabs to improve performance and prevent excessive tab accumulation. When the limit is reached, the oldest (leftmost) tab is automatically closed to make room for new tabs, providing a seamless user experience.

## Configuration

### Environment Variable

Add to your `.env` file:

```bash
# Maximum number of tabs allowed in the admin dashboard (default: 5)
ADMIN_MAX_TABS=5
```

### Global Settings

The feature also supports database configuration through the global settings service with the key `ADMIN_MAX_TABS`.

**Priority**: Environment variable takes precedence over global settings.

## Features

### Tab Count Display
- Shows current tab count vs limit in the tab bar (e.g., "3/5 tabs")
- Changes to blue color with refresh icon when limit is reached
- Only visible when tabs are open

### Auto-Close Behavior
- **When limit is reached**: Automatically closes the oldest (leftmost) tab
- **Seamless workflow**: Users can always open new tabs without manual cleanup
- **Smart notifications**: Shows which tab was closed and what was opened
- **Preserves active tab**: Maintains proper active tab state after auto-close

### User Notifications
- **Auto-close message**: "Closed 'Old Tab Name' to make room for 'New Tab Name'."
- **Visual feedback**: Blue notification with info icon (not warning)
- **Auto-dismiss**: Notifications disappear after 3 seconds

### Persistence Handling
- **localStorage**: Maintains tab limit during sessions
- **URL parameters**: Respects tab limit when loading from URL
- **Configuration changes**: Applies immediately on page reload

## Implementation Details

### Backend Changes
- Modified `src/middleware.js` to fetch configuration and pass to template
- Added support for both environment variables and global settings
- Default limit: 5 tabs

### Frontend Changes
- Updated `views/admin-dashboard.ejs` with auto-close tab logic
- Enhanced `views/partials/dashboard/tab-bar.ejs` with improved indicators
- Added informative notification system

### Key Functions
- `openTab()`: Auto-closes oldest tab when limit is reached
- `loadTabsFromStorage()`: Trims tabs to limit when loading
- `loadTabsFromURL()`: Respects limit when loading from URL

## Auto-Close Logic

```javascript
// When limit is reached:
if (tabs.value.length >= maxTabs) {
    const oldestTab = tabs.value[0]; // Leftmost tab
    const wasOldestActive = activeTabId.value === oldestTab.id;
    
    // Show informative notification
    tabLimitMessage.value = `Closed "${oldestTab.label}" to make room for "${item.label}".`;
    
    // Auto-close oldest tab
    tabs.value.shift();
    
    // Handle active tab state
    if (wasOldestActive && tabs.value.length > 0) {
        activeTabId.value = tabs.value[0].id;
    }
}
```

## Edge Cases Handled

1. **Single tab limit**: Works correctly when maxTabs = 1
2. **Active tab closure**: Properly handles when oldest tab is active
3. **Invalid configuration values**: Falls back to default (5)
4. **Existing sessions**: Trims tabs gracefully on load
5. **Configuration changes**: Applies immediately on page reload

## User Experience Benefits

1. **No Interruption**: Users can always open new tabs
2. **Predictable Behavior**: Oldest tab is always closed first
3. **Clear Feedback**: Users know exactly what happened
4. **Workflow Continuity**: No need to manually manage tabs

## Testing

The feature has been tested with:
- Different limit values (1, 3, 5, 10)
- Auto-close logic verification
- Edge cases (single tab, active tab scenarios)
- User notification display
- Persistence and URL handling

## Browser Compatibility

Works in all modern browsers that support:
- Vue.js 3
- ES6+ JavaScript features
- LocalStorage API
