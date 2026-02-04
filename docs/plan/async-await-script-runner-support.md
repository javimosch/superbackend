# Plan: Async/Await Support for Script Runner

## Overview
Enhance the script runner to properly handle scripts containing `await` statements by auto-wrapping them in async functions, providing better error messages, and updating documentation.

## Findings

- The `node` + `host` runner uses `vm2`'s `NodeVM` in `runHostWithDatabase()` (not `node -e`), so scripts behave like CommonJS code executed via `vm.run(...)`.
- `vm2` does not support top-level `await` in that execution mode, so scripts containing `await` at the top level fail with: `await is only valid in async functions...`.
- The most reliable fix is to wrap user code in an async IIFE when we detect top-level `await`.

## Implementation Plan

### 1. Auto-Detection and Auto-Wrapping of Async Scripts

**Location**: `src/services/scriptsRunner.service.js`

**Changes**:
- Add function `detectAwaitUsage(code)` to check if script contains await statements
- Add function `wrapInAsyncFunction(code)` to wrap scripts in IIFE
- Modify `runHostWithDatabase` and `runVm2` functions to auto-wrap when needed

**Implementation Details**:
```javascript
function detectAwaitUsage(code) {
  // Simple regex to detect await usage outside of function definitions
  const awaitRegex = /(?:^|\n|\s|\{|\(|\[|,)await\s+/;
  return awaitRegex.test(code);
}

function wrapInAsyncFunction(code) {
  return `(async () => {\n${code}\n})();`;
}
```

**Implemented**:

- Added `prepareVmCodeForExecution(code)` in `src/services/scriptsRunner.service.js`.
- When enabled, it detects likely top-level `await` and transforms the code into:
  - `(async () => { ... })().catch(...)`
- Auto-wrapping is enabled by default and can be disabled via `SCRIPT_AUTO_ASYNC_WRAP=false`.

### 2. Enhanced Error Messages

**Location**: `src/services/scriptsRunner.service.js`

**Changes**:
- Improve error handling in VM execution to detect async/await errors
- Provide helpful error messages with examples

**Implementation Details**:
```javascript
if (vmError?.message?.includes('await is only valid in async functions')) {
  const errorMsg = `VM execution error: await is only valid in async functions\n\n` +
    `Your script contains await statements but is not wrapped in an async function.\n\n` +
    `Fix: Wrap your code in an async function:\n\n` +
    `(async () => {\n` +
    `  // Your code here\n` +
    `  const result = await someAsyncOperation();\n` +
    `  console.log(result);\n` +
    `})();\n\n` +
    `Or the system can auto-wrap it for you in future versions.`;
}
```

### 3. VM Configuration for Top-Level Await Support

**Location**: `src/services/scriptsRunner.service.js`

**Changes**:
- Update NodeVM configuration to enable ES modules support
- Add proper module type detection
- Configure VM to support modern JavaScript features

**Implementation Details**:
```javascript
const vm = new NodeVM({
  console: 'inherit',
  sandbox: { /* existing sandbox */ },
  require: {
    external: false,
    builtin: ['util', 'path', 'os'],
  },
  timeout: timeoutMs,
  eval: false,
  wasm: false,
  // Enable ES modules for top-level await support
  sourceType: 'module', // or detect based on content
});
```

**Implemented decision**:

- We did not rely on `sourceType: 'module'` for correctness.
- Instead, we use async IIFE wrapping as the compatibility layer for both `node/host` and `node/vm2` execution paths.

### 4. Documentation Updates

**Location**: `docs/features/scripts-module.md`

**Changes**:
- Add section "Writing Async Scripts"
- Provide clear examples of proper async usage
- Document auto-wrapping behavior

**New Documentation Section**:
```markdown
### Writing Async Scripts

When using `await` in your scripts, you have two options:

#### Option 1: Manual Async Wrapping (Recommended)
```javascript
(async () => {
  // Connect to database
  await mongooseHelper.connect();
  
  // Use await for async operations
  const users = await User.find({});
  console.log(`Found ${users.length} users`);
  
  // Cleanup
  await mongooseHelper.disconnect();
})();
```

#### Option 2: Auto-Wrapping (Experimental)
The system can automatically detect and wrap scripts containing `await`:
```javascript
// This will be auto-wrapped
const users = await User.find({});
console.log(`Found ${users.length} users`);
```

#### Database Operations with Host Runner
When using `node` + `host` runner, you have access to:
- Pre-connected `mongoose` instance
- `countCollectionDocuments()` helper
- `getConnectionStatus()` helper

Example:
```javascript
// Use the provided database connection
const status = getConnectionStatus();
console.log('Database status:', status);

// Count documents
const count = await countCollectionDocuments('users');
console.log(`Users count: ${count}`);
```
```

## Implementation Steps

1. **Phase 1: Detection and Wrapping**
   - Implement `detectAwaitUsage()` function
   - Implement `wrapInAsyncFunction()` function
   - Update `runHostWithDatabase` to auto-wrap
   - Update `runVm2` to auto-wrap

2. **Phase 2: Error Handling**
   - Enhance error messages for async errors
   - Add helpful examples in error output
   - Test with various async patterns

3. **Phase 3: VM Configuration**
   - Experiment with ES modules support
   - Test top-level await compatibility
   - Ensure backward compatibility

4. **Phase 4: Documentation**
   - Update scripts-module.md
   - Add examples to admin UI
   - Create troubleshooting section

## Testing Strategy

1. **Unit Tests**
   - Test `detectAwaitUsage()` with various code patterns
   - Test `wrapInAsyncFunction()` edge cases
   - Test error message formatting

2. **Integration Tests**
   - Test scripts with await at top level
   - Test scripts with manual async wrapping
   - Test error scenarios

3. **Manual Tests**
   - Create test scripts in admin UI
   - Verify auto-wrapping works
   - Check error messages are helpful

## Backward Compatibility

- All existing scripts continue to work
- Auto-wrapping is opt-in based on detection
- No breaking changes to API
- Fallback to current behavior if wrapping fails

## Performance Considerations

- Detection regex is lightweight
- Wrapping adds minimal overhead
- VM execution time unchanged
- Memory impact negligible

## Rollback Plan

- Feature can be disabled via environment variable
- Simple to revert changes in runner functions
- Documentation updates are additive
- No database schema changes needed

## Environment Variables

Add optional environment variable for controlling the feature:
- `SCRIPT_AUTO_ASYNC_WRAP=true` (default: true)
- `SCRIPT_ASYNC_WRAP_DEBUG=false` (default: false) - for debugging auto-wrap behavior

## Final Implementation Notes

- Updated runners:
  - `runHostWithDatabase()` now executes `prepareVmCodeForExecution(code)` and runs the prepared code.
  - `runVm2()` now executes `prepareVmCodeForExecution(code)` and runs the prepared code.
- Updated docs:
  - `docs/features/scripts-module.md` now documents async/await support and the auto-wrapping toggle.
