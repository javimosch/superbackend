# Plan: Remove VM2 from node/host for True Node.js Host Execution

## Overview
Currently, node/host runner uses VM2 internally, which creates unnecessary overhead and restrictions. This plan converts node/host to use true Node.js process execution with minimal safety wrapper.

## Current State
- node/host → runHostWithDatabase → creates VM2 instance with database context
- VM2 sandbox restricts built-in modules and adds overhead
- Scripts cannot access full Node.js ecosystem
- "Client must be connected" errors due to VM2 limitations

## Proposed Changes

### 1. Replace runHostWithDatabase with True Host Execution
- Remove VM2 dependency from node/host
- Use existing `runSpawned` function as base
- Create database context injection via environment variables or bootstrap code
- Maintain logging and process management

### 2. Database Connection Strategy
Option A: Bootstrap Code Injection
- Wrap user script with database connection setup
- Prepend connection code to user script
- Execute as single Node.js process

Option B: Environment-Based Context
- Pass connection info via environment variables
- Include helper module path in NODE_PATH
- User script requires helper module

### 3. Safety Wrapper Implementation
- Timeout management (existing)
- Process isolation (existing)
- Resource limits (existing)
- Output capture (existing)
- Database connection management

## Implementation Plan

### Phase 1: Create Database Helper Module
Create `src/helpers/scriptDatabaseHelper.js`:
```javascript
// Exports database connection and utilities
module.exports = {
  connect: async () => { /* connection logic */ },
  getDb: () => mongoose.connection.db,
  getModels: () => mongoose.models,
  disconnect: async () => { /* cleanup */ }
};
```

### Phase 2: Modify runHostWithDatabase
Replace VM2 implementation with:
1. Database connection setup
2. Script wrapping with database context
3. Execute via `runSpawned` with modified args
4. Maintain existing logging and error handling

### Phase 3: Script Execution Flow
```javascript
// New flow for node/host:
1. Ensure database connection
2. Create wrapped script:
   - require database helper
   - user code
   - cleanup code
3. Execute via node -e "<wrapped code>"
4. Capture output and manage process
```

### Phase 4: Remove VM2 Dependencies
- Remove NodeVM import from runHostWithDatabase
- Clean up sandbox-related code
- Update documentation

## Technical Details

### Script Wrapper Structure
```javascript
require('dotenv').config();
const { scriptDatabaseHelper } = require('./src/helpers/scriptDatabaseHelper');

async function executeWithDatabase() {
  try {
    // Setup database connection
    await scriptDatabaseHelper.connect();
    
    // Make database available globally
    global.db = scriptDatabaseHelper.getDb();
    global.mongoose = require('mongoose');
    global.models = scriptDatabaseHelper.getModels();
    
    // User script code here
    ${userScriptCode}
    
    // Cleanup
    await scriptDatabaseHelper.disconnect();
  } catch (error) {
    console.error('Script error:', error);
    process.exit(1);
  }
}

executeWithDatabase();
```

### Safety Considerations
- Process timeout maintained
- Environment variable isolation
- Working directory restrictions
- Output capture and limits
- Database connection cleanup

### Benefits
- Full Node.js ecosystem access
- No VM2 restrictions on built-in modules
- Better performance (no VM overhead)
- True database operations via db.collection()
- Simpler debugging and error handling
- Access to npm modules in node_modules

### Migration Path
1. Implement new runHostWithDatabase
2. Test with existing scripts
3. Update documentation
4. Remove old VM2 code

## Files to Modify
- `src/services/scriptsRunner.service.js` - Main implementation
- `src/helpers/scriptDatabaseHelper.js` - New helper module
- Documentation updates

## Testing Strategy
1. Test basic database operations (find, insert, update, delete)
2. Test model operations
3. Test timeout and error handling
4. Test resource cleanup
5. Verify logging output

## Rollback Plan
Keep VM2 implementation as fallback if issues arise:
- Add feature flag to choose between VM2 and true host
- Gradual migration with monitoring
- Quick revert capability

## Success Criteria
- Scripts can perform any MongoDB operation via db.collection()
- No "Client must be connected" errors
- Full Node.js built-in module access
- Performance improvement over VM2
- Maintained safety and isolation
