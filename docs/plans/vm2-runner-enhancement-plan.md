# VM2 Runner Enhancement Plan

## Overview

Improve the Superbackend VM2 runner to handle `module.exports` function patterns more flexibly, allowing scripts that define exported functions to automatically execute them while maintaining backward compatibility.

## Current Limitations

### Issues Identified
1. **Function Definition Only**: Scripts with `module.exports = function() {...}` define functions but never execute them
2. **No Console Output**: Since functions aren't called, no console.log statements are executed
3. **Poor Developer Experience**: Users expect their scripts to run, not just define functions
4. **Inconsistent Behavior**: Other Superbackend services (workflow) handle module.exports differently

### Current VM2 Runner Flow
```javascript
// Current logic in runVm2()
const prepared = prepareVmCodeForExecution(code);
vm.run(prepared.code, 'script.vm2.js'); // Just runs as-is
```

### Current Detection Logic
```javascript
function detectTopLevelAwait(code) {
  // ...
  if (/\bmodule\.exports\b/.test(s) || /\bexports\./.test(s)) return false;
  // Excludes module.exports from auto-wrapping
}
```

## Proposed Enhancement

### 1. Enhanced Script Pattern Detection

Add new detection functions to identify different script patterns:

```javascript
function detectModuleExportsFunction(code) {
  // Detect: module.exports = async function() {...}
  // Detect: module.exports = function() {...}
  // Detect: exports.functionName = async function() {...}
}

function detectSelfExecutingScript(code) {
  // Detect if script already calls itself
  // Detect: module.exports(); // at end
  // Detect: (function(){...})();
}

function detectScriptType(code) {
  return {
    hasModuleExports: detectModuleExportsFunction(code),
    hasTopLevelAwait: detectTopLevelAwait(code),
    isSelfExecuting: detectSelfExecutingScript(code),
    isImmediateExecution: !detectModuleExportsFunction(code)
  };
}
```

### 2. Enhanced Code Preparation

New `prepareVmCodeForExecutionEnhanced()` function:

```javascript
function prepareVmCodeForExecutionEnhanced(code) {
  const raw = String(code || '');
  const scriptType = detectScriptType(raw);
  
  // Case 1: Immediate execution (current behavior)
  if (scriptType.isImmediateExecution) {
    return { code: raw, wrapped: false, type: 'immediate' };
  }
  
  // Case 2: Self-executing (already handled)
  if (scriptType.isSelfExecuting) {
    return { code: raw, wrapped: false, type: 'self-executing' };
  }
  
  // Case 3: Module exports function (NEW)
  if (scriptType.hasModuleExports) {
    const enhancedCode = wrapModuleExportsForExecution(raw);
    return { code: enhancedCode, wrapped: true, type: 'module-exports' };
  }
  
  // Case 4: Top-level await (existing behavior)
  if (scriptType.hasTopLevelAwait) {
    return { code: wrapInAsyncIife(raw), wrapped: true, type: 'top-level-await' };
  }
  
  return { code: raw, wrapped: false, type: 'unknown' };
}
```

### 3. Module.exports Wrapper Function

```javascript
function wrapModuleExportsForExecution(code) {
  return [
    '// Auto-wrapped module.exports function for VM2 execution',
    '// Original script preserved below',
    '',
    code,
    '',
    '// Auto-execute the exported function',
    'if (typeof module.exports === "function") {',
    '  module.exports().catch((err) => {',
    '    try { console.error("Script execution error:", err && err.stack ? err.stack : err); } catch {}',
    '  });',
    '} else if (module.exports && typeof module.exports.default === "function") {',
    '  module.exports.default().catch((err) => {',
    '    try { console.error("Script execution error:", err && err.stack ? err.stack : err); } catch {}',
    '  });',
    '} else {',
    '  console.log("Script does not export a function to execute");',
    '}',
    ''
  ].join('\n');
}
```

### 4. Enhanced VM2 Runner

Update `runVm2()` function:

```javascript
async function runVm2({ runId, bus, code, timeoutMs }) {
  // ... existing setup ...
  
  try {
    const prepared = prepareVmCodeForExecutionEnhanced(code);
    
    // Log the transformation for debugging
    if (prepared.wrapped) {
      await pushLog('stdout', `Auto-wrapped script (${prepared.type})\n`);
    }
    
    vm.run(prepared.code, 'script.vm2.js');
    return 0;
  } catch (err) {
    // ... existing error handling ...
  }
}
```

## Implementation Strategy

### Phase 1: Detection Functions
- Implement `detectModuleExportsFunction()`
- Implement `detectSelfExecutingScript()`
- Implement `detectScriptType()`
- Add comprehensive unit tests

### Phase 2: Enhanced Preparation
- Implement `wrapModuleExportsForExecution()`
- Implement `prepareVmCodeForExecutionEnhanced()`
- Add logging for debugging transformations
- Test with various script patterns

### Phase 3: Integration
- Update `runVm2()` to use enhanced preparation
- Replace existing `prepareVmCodeForExecution()` with enhanced version
- Add comprehensive integration tests

### Phase 4: Documentation & UI Updates
- Update script documentation
- Update Scripts Admin UI built-in documentation (`/ref-superbackend/views/admin-scripts.ejs`)
- Provide examples of supported patterns
- Add migration notes

## Supported Script Patterns

### Pattern 1: Immediate Execution (Current)
```javascript
console.log('This runs immediately');
// ... script logic
```

### Pattern 2: Module.exports Function (Enhanced)
```javascript
module.exports = async function() {
  console.log('This will auto-execute');
  // ... script logic
};
// Auto-execution added by enhanced runner
```

### Pattern 3: Self-Executing (Unchanged)
```javascript
module.exports = async function() {
  console.log('This runs immediately');
};
module.exports(); // Already handled
```

### Pattern 4: Top-level Await (Unchanged)
```javascript
const result = await someAsyncFunction();
console.log(result);
```

## Documentation & UI Updates

### Scripts Admin UI Documentation Updates

The built-in documentation in `/ref-superbackend/views/admin-scripts.ejs` needs to be updated to reflect the new supported patterns for VM2 runner.

#### Current VM2 Documentation (Lines 185-228)
Currently shows only immediate execution pattern with limitations noted as "No file system, network, or most Node.js APIs".

#### Required Updates

**1. Update VM2 Runner Section**
- Add new supported patterns documentation
- Update limitations section
- Add examples for each pattern

**2. New Pattern Examples**
```javascript
// Pattern 1: Immediate Execution (existing)
console.log('This runs immediately');
// ... script logic

// Pattern 2: Module.exports Function (NEW)
module.exports = async function() {
  console.log('This auto-executes');
  // ... script logic
  return { success: true, data: results };
};

// Pattern 3: Self-Executing (existing)
module.exports = async function() {
  console.log('This runs immediately');
};
module.exports(); // Already handled

// Pattern 4: Top-level Await (existing)
const result = await someAsyncFunction();
console.log(result);
```

**3. Update Limitations Section**
- Remove "No file system, network, or most Node.js APIs" limitation
- Update to: "Limited Node.js APIs, auto-execution for module.exports functions"
- Add note about enhanced flexibility

**4. Update Use Cases**
- Add "Function-based scripts" to use cases
- Include "Health monitoring scripts" as example
- Note "Auto-execution of exported functions"

### Documentation File Updates

**File to Update**: `/ref-superbackend/views/admin-scripts.ejs`

**Section**: Lines 185-228 (VM2 Runner documentation)

**Changes Required**:
1. Update the example code to show module.exports pattern
2. Update limitations text
3. Add note about auto-execution capability
4. Update use case description

## Backward Compatibility

### Guarantees
1. **Existing Scripts**: All current scripts continue to work unchanged
2. **Immediate Execution**: Scripts without module.exports work exactly as before
3. **Top-level Await**: Existing await wrapping behavior preserved
4. **Self-Executing**: Already working patterns remain functional

### Migration Path
1. **Direct Implementation**: Enhanced runner replaces existing implementation
2. **Comprehensive Testing**: Ensure all existing scripts work
3. **Documentation Update**: Clear examples of supported patterns

## Testing Strategy

### Unit Tests
- Test all detection functions with various code patterns
- Test wrapper functions with edge cases
- Test error handling scenarios

### Integration Tests
- Test Bot Health Monitor script with enhanced runner
- Test existing scripts to ensure no regression
- Test error scenarios and recovery

### Performance Tests
- Measure overhead of enhanced detection
- Test with large scripts
- Monitor memory usage

## Benefits

### Developer Experience
1. **Intuitive Behavior**: Scripts with module.exports just work
2. **Better Debugging**: Console output captured properly
3. **Consistent Patterns**: Similar to other Superbackend services
4. **Reduced Confusion**: No need to understand VM2 internals

### System Benefits
1. **Flexibility**: Supports multiple script patterns
2. **Maintainability**: Clear separation of concerns
3. **Extensibility**: Easy to add new patterns
4. **Reliability**: Comprehensive error handling

## Risks & Mitigations

### Risks
1. **Breaking Changes**: Existing scripts might behave differently
2. **Performance**: Additional detection overhead
3. **Complexity**: More code paths to maintain

### Mitigations
1. **Comprehensive Testing**: Extensive test coverage before deployment
2. **Documentation**: Clear examples of supported patterns
3. **Code Review**: Thorough review of all changes

## Success Criteria

1. ✅ Bot Health Monitor script works without modification
2. ✅ All existing scripts continue to work
3. ✅ Console output captured for all script types
4. ✅ Zero performance regression for existing patterns
5. ✅ Clear documentation with examples
6. ✅ Scripts Admin UI documentation updated with new patterns
7. ✅ Comprehensive test coverage (>90%)

## Timeline

- **Phase 1**: 1-2 days (Detection functions)
- **Phase 2**: 2-3 days (Enhanced preparation)
- **Phase 3**: 1-2 days (Integration)
- **Phase 4**: 1 day (Documentation)
- **Total**: 5-8 days

## Next Steps

1. Review and approve this plan
2. Create implementation branch
3. Implement Phase 1 (Detection functions)
4. Test with Bot Health Monitor script
5. Complete remaining phases
6. Update Scripts Admin UI documentation
7. Deploy enhanced VM2 runner
