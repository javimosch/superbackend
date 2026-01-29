# Plan: Environment Variable Toggle for Console Manager

## Overview
Add environment variable and global settings support to enable/disable the console manager, with UI toggle control. This provides three ways to control console manager: environment variable (highest priority), global settings, and UI toggle (uses global settings under the hood).

## Current State Analysis

### Console Manager Initialization
- Currently initialized in `src/middleware.js` after DB connection (lines 131-133, 225-227)
- No environment variable or global settings check - always initializes if not in test environment
- Uses `consoleManager.init()` to override console methods

### Global Settings Pattern
- File Manager already uses this pattern with `FILE_MANAGER_ENABLED` setting
- Global settings are loaded once at startup and cached (restart required for changes)
- Pattern: `globalSettingsService.getSettingValue("SETTING_KEY", "default")`

### UI Configuration
- Console Manager UI already has config section with `enabled` checkbox (line 285-287 in EJS)
- This currently only controls console output gating, not initialization

## Implementation Plan

### 1. Environment Variable Support

#### 1.1 Add Environment Variable
- Add `CONSOLE_MANAGER_ENABLED` to `.env.example`
- Default value: `true` (maintain current behavior)
- Support both new and legacy naming following existing patterns:
  - New: `CONSOLE_MANAGER_ENABLED`  
  - Legacy: Not needed for new feature

#### 1.2 Environment Variable Check Logic
```javascript
function isConsoleManagerEnabled() {
  // Environment variable takes highest priority
  const envEnabled = process.env.CONSOLE_MANAGER_ENABLED;
  if (envEnabled !== undefined) {
    return String(envEnabled).toLowerCase() !== 'false';
  }
  return true; // Default to enabled
}
```

### 2. Global Settings Integration

#### 2.1 Add Global Setting Key
- Use `CONSOLE_MANAGER_ENABLED` as the global setting key
- Default to `true` to maintain current behavior

#### 2.2 Modified Initialization Logic
```javascript
// In middleware.js, replace current consoleManager.init() calls:
if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
  // Check environment variable first
  const envEnabled = process.env.CONSOLE_MANAGER_ENABLED;
  if (envEnabled !== undefined) {
    if (String(envEnabled).toLowerCase() !== 'false') {
      consoleManager.init();
    }
  } else {
    // Check global settings if env var not set
    try {
      const enabledRaw = await globalSettingsService.getSettingValue(
        "CONSOLE_MANAGER_ENABLED",
        "true"
      );
      if (String(enabledRaw) === "true") {
        consoleManager.init();
      }
    } catch (error) {
      console.error("Error loading Console Manager setting:", error);
      // Fallback to enabled on error
      consoleManager.init();
    }
  }
}
```

### 3. UI Toggle Integration

#### 3.1 Modify Console Manager Config UI
- Add a new "Global Settings" section in the config tab
- Add toggle that updates global settings when changed
- Show current state and explain restart requirement

#### 3.2 Add API Endpoint for Global Settings Update
- Add endpoint to update `CONSOLE_MANAGER_ENABLED` global setting
- Use existing global settings API infrastructure
- Return success message with restart notice

#### 3.3 UI Implementation Details
```javascript
// Add to Vue.js config section:
data() {
  return {
    // ... existing data
    globalSettings: {
      consoleManagerEnabled: true
    }
  };
},

methods: {
  async loadGlobalSettings() {
    // Load current global setting value
  },
  
  async updateGlobalSetting() {
    // Update global setting via API
    // Show restart required message
  }
}
```

### 4. Priority and Precedence

#### 4.1 Control Priority (highest to lowest)
1. **Environment Variable** - `CONSOLE_MANAGER_ENABLED`
2. **Global Settings** - `CONSOLE_MANAGER_ENABLED` database setting
3. **Default** - `true` (current behavior)

#### 4.2 Restart Requirements
- **Environment Variable**: Requires restart (read at startup)
- **Global Settings**: Requires restart (loaded once at startup)
- **UI Toggle**: Updates global settings, requires restart

### 5. Implementation Files

#### 5.1 Files to Modify
1. `src/middleware.js` - Add environment variable and global settings check
2. `views/admin-console-manager.ejs` - Add global settings UI section
3. `src/routes/adminConsoleManager.routes.js` - Add global settings endpoint
4. `.env.example` - Add environment variable documentation

#### 5.2 Files to Create
- None needed (using existing infrastructure)

### 6. Implementation Steps

#### Phase 1: Environment Variable Support
1. Add `CONSOLE_MANAGER_ENABLED` to `.env.example`
2. Modify `middleware.js` to check environment variable
3. Test environment variable behavior

#### Phase 2: Global Settings Integration  
1. Modify `middleware.js` to check global settings as fallback
2. Add global settings API endpoint
3. Test global settings behavior

#### Phase 3: UI Toggle
1. Add global settings section to console manager UI
2. Implement toggle functionality
3. Add restart required messaging
4. Test UI integration

### 7. Error Handling

#### 7.1 Initialization Errors
- If global settings loading fails, default to enabled (current behavior)
- Log errors but don't prevent application startup

#### 7.2 UI Errors
- Handle API errors gracefully
- Show user-friendly error messages
- Fallback to current state on failure

### 8. Testing Requirements

#### 8.1 Environment Variable Tests
- Test with `CONSOLE_MANAGER_ENABLED=true`
- Test with `CONSOLE_MANAGER_ENABLED=false`
- Test with environment variable unset
- Test invalid values (treat as enabled)

#### 8.2 Global Settings Tests
- Test with global setting `true`/`false`
- Test with missing global setting
- Test global settings loading errors

#### 8.3 UI Tests
- Test toggle functionality
- Test API integration
- Test error handling
- Test restart messaging

### 9. Documentation Updates

#### 9.1 Environment Variable Documentation
- Add to `.env.example` with clear description
- Document precedence rules
- Include restart requirement notice

#### 9.2 Feature Documentation
- Update `docs/features/console-manager.md`
- Document new control methods
- Add troubleshooting section

### 10. Backward Compatibility

#### 10.1 Breaking Changes
- None - maintains current behavior by default
- Existing functionality unchanged when enabled

#### 10.2 Migration Path
- No migration required for existing installations
- New installations can disable via environment variable if needed

### 11. Security Considerations

#### 11.1 Access Control
- Global settings changes already protected by admin auth
- Environment variable controlled at system level
- UI toggle respects existing admin authentication

#### 11.2 Validation
- Validate input values in API endpoints
- Sanitize environment variable values
- Handle edge cases gracefully

## Success Criteria

1. ✅ Environment variable `CONSOLE_MANAGER_ENABLED` controls initialization
2. ✅ Global setting `CONSOLE_MANAGER_ENABLED` provides runtime control
3. ✅ UI toggle allows admin to control via global settings
4. ✅ Proper precedence: env var > global settings > default
5. ✅ Restart required behavior clearly communicated
6. ✅ Backward compatibility maintained
7. ✅ Error handling robust
8. ✅ Documentation updated

## Technical Notes

### Console Override Behavior
- When disabled: Console manager never initializes, no console override
- When enabled: Current behavior preserved (console override with gating)
- Console manager config `enabled` field still controls individual entry gating

### Performance Impact
- Minimal overhead from additional checks at startup
- No runtime performance impact when disabled (no override)
- Global settings cached per existing pattern

### Monitoring and Debugging
- Add logging for console manager initialization state
- Log which control method is being used (env var vs global settings)
- Maintain existing console manager logging patterns
