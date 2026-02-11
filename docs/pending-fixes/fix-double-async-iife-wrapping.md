# Fix: Double Async IIFE Wrapping Issue

## Problem Description
The script output system is incorrectly double-wrapping async IIFE functions, causing:

1. **Double Wrapping**: Scripts that are already `(async function() { ... })` are being wrapped again
2. **Nested Async Functions**: Creates `(async () => { (async function() { ... }) })` structure
3. **Return Value Loss**: The inner function's return value isn't properly captured by the outer wrapper
4. **Incorrect Output**: Shows "Auto-wrapping script to capture return value" instead of actual results

## Current Behavior
```
Input Script: (async function() { ... return summary; })();
Detected as: Existing async IIFE (should NOT be wrapped)
But gets: Wrapped again with outer async function
Result: Double nesting, return value lost
```

## Expected Behavior
```
Input Script: (async function() { ... return summary; })();
Detected as: Existing async IIFE (should NOT be wrapped)
Should get: Proper result capture from existing IIFE
Result: Clean programmatic output with summary data
```

## Root Cause Analysis

### Issue in `prepareVmCodeForExecution()`
```javascript
// Current logic
if (/^\s*\(\s*async\s+function\s*\(/.test(raw) && !/global\.__scriptResult\s*=/.test(raw)) {
  // This condition is TRUE for existing async IIFE
  // But the wrapping logic is flawed
  return { code: wrapExistingAsyncIife(raw), wrapped: true };
}
```

### Issue in `wrapExistingAsyncIife()`
```javascript
// Current implementation
const codeWithoutEnding = body.replace(/\)\s*;?\s*$/, '');
return [
  codeWithoutEnding,
  ').then((result) => {',  // This creates invalid syntax
  '  global.__scriptResult = result;',
  '}).catch((err) => {',
  '  global.__scriptResult = { error: err.message || String(err) };',
  '});',
].join('\n');
```

## Problems with Current Implementation

1. **Invalid Syntax**: Removing the final `)` and adding `.then()` creates malformed code
2. **Double Execution**: Both inner and outer async functions execute
3. **Race Conditions**: Multiple async operations compete for completion
4. **Result Confusion**: Which result should be captured?

## Required Fixes

### 1. Fix Detection Logic
Update `prepareVmCodeForExecution()` to properly detect and handle existing async IIFE:

```javascript
function prepareVmCodeForExecution(code) {
  const raw = String(code || '');
  if (!shouldAutoWrapAsyncScripts()) return { code: raw, wrapped: false };
  if (!detectTopLevelAwait(raw)) return { code: raw, wrapped: false };
  
  // Check if it's already a self-executing async IIFE
  if (isSelfExecutingAsyncIife(raw)) {
    // Don't wrap, but add result capture to the existing IIFE
    return { code: addResultCaptureToExistingIife(raw), wrapped: false };
  }
  
  return { code: wrapInAsyncIife(raw), wrapped: true };
}

function isSelfExecutingAsyncIife(code) {
  // Pattern: (async function() { ... })() or (async () => { ... })()
  return /^\s*\(\s*async\s+(function\s*\(\s*\)|\(\s*\))\s*\{[\s\S]*\}\s*\)\s*\(\s*\)\s*;?\s*$/.test(code);
}
```

### 2. Fix Result Capture for Existing IIFE
Create a proper result capture mechanism for existing async IIFE:

```javascript
function addResultCaptureToExistingIife(code) {
  // Insert result capture before the final execution
  const codeWithoutExecution = code.replace(/\)\s*\(\s*\)\s*;?\s*$/, '');
  return [
    codeWithoutExecution,
    ')().then((result) => {',
    '  global.__scriptResult = result;',
    '}).catch((err) => {',
    '  try { console.error(err && err.stack ? err.stack : err); } catch {}',
    '  global.__scriptResult = { error: err.message || String(err) };',
    '});',
    ''
  ].join('\n');
}
```

### 3. Update Execution Logic
Modify runner execution to handle both wrapped and non-wrapped scenarios:

```javascript
// In both VM2 and host runners
if (prepared.wrapped) {
  // For newly wrapped scripts
  await new Promise(resolve => setTimeout(resolve, 100));
  scriptResult = vm.sandbox.__scriptResult;
} else {
  // For existing IIFE with result capture added
  await new Promise(resolve => setTimeout(resolve, 100));
  scriptResult = vm.sandbox.__scriptResult;
  if (!scriptResult && lastConsoleLog) {
    scriptResult = lastConsoleLog;
  }
}
```

### 4. Improve Debugging
Add better logging to track what's happening:

```javascript
if (prepared.wrapped) {
  await pushLog('stdout', 'Auto-wrapping script to capture return value\n');
} else {
  await pushLog('stdout', 'Adding result capture to existing async IIFE\n');
}
```

## Test Cases to Validate

### 1. Existing Async IIFE (Current Issue)
```javascript
(async function() {
  const result = { status: "success" };
  console.log("Processing...");
  return result;
})();
```
**Expected**: Proper result capture without double wrapping

### 2. Async Arrow Function IIFE
```javascript
(async () => {
  const result = { status: "success" };
  console.log("Processing...");
  return result;
})();
```
**Expected**: Proper result capture without double wrapping

### 3. Script with Top-Level Await (Should be wrapped)
```javascript
const data = await fetchData();
console.log(data);
return { processed: true };
```
**Expected**: Normal auto-wrapping behavior

### 4. Non-Async Script (Should not be wrapped)
```javascript
const result = processData();
console.log(result);
return result;
```
**Expected**: No wrapping, direct result capture

## Implementation Priority

1. **High**: Fix detection logic to prevent double wrapping
2. **High**: Fix result capture for existing async IIFE
3. **Medium**: Improve debugging and logging
4. **Low**: Add comprehensive test coverage

## Files to Modify

1. **src/services/scriptsRunner.service.js**
   - `prepareVmCodeForExecution()` function
   - `wrapExistingAsyncIife()` function (rename/refactor)
   - Add new `isSelfExecutingAsyncIife()` function
   - Add new `addResultCaptureToExistingIife()` function
   - Update execution logic in both runners

2. **tests/scriptsRunner.service.test.js**
   - Add test cases for existing async IIFE
   - Add test cases for double wrapping prevention
   - Validate result capture for different script types

## Success Criteria

- ✅ Existing async IIFE scripts are not double-wrapped
- ✅ Return values are properly captured from existing async IIFE
- ✅ No syntax errors in generated code
- ✅ Both wrapped and non-wrapped scripts work correctly
- ✅ Debugging logs clearly indicate what's happening
- ✅ Bot health monitor script returns proper structured results

## Notes for Implementation

- Be careful with regex patterns for detecting async IIFE
- Test edge cases with whitespace and formatting variations
- Ensure the result capture doesn't break existing functionality
- Consider performance implications of more complex detection logic
- Maintain backward compatibility with existing scripts
