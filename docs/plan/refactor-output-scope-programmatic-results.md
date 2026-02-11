# Plan: Refactor Output Scope for Programmatic Results

## Overview
Refactor the script output system to separate infrastructure noise from programmatic results, ensuring the Output tab shows only clean return values or meaningful console.log statements while maintaining complete execution details in the Full Console Logs tab.

## Current Problem Analysis

### Issues Identified
- **Output Tab Noise**: Shows infrastructure logs, script wrapping details, and all console.log statements
- **No Programmatic Focus**: Mixed debugging logs with actual results
- **API Inconsistency**: UI output doesn't match what programmatic consumers would receive

### Current Behavior
```
Output Tab (NOISY):
Using existing app database connection
Auto-wrapping script in async function (detected top-level await)
=== SCRIPT START ===
Executing script (6136 chars)...
Script preview: (async function() {...
🔍 Bot Health Monitor - Execution Started
Database connection established
=== SCRIPT END ===
Found 2 enabled paper trading bots
✅ Bot Arbitrage Spread Bot - $100 Paper...
```

### Desired Behavior
```
Output Tab (CLEAN):
{
  "total": 3,
  "healthy": 2,
  "disabled": 1,
  "errors": 0,
  "mode": "AUTO DISABLE",
  "timestamp": "2026-02-11T05:19:19.669Z",
  "results": [...]
}

Full Console Logs Tab (COMPLETE):
Using existing app database connection
Auto-wrapping script in async function...
🔍 Bot Health Monitor - Execution Started
Database connection established
=== SCRIPT END ===
Found 2 enabled paper trading bots
✅ Bot Arbitrage Spread Bot...
```

## Proposed Solution

### 1. Dual Output System

#### Output Tab: Programmatic Results Only
- Capture script return value (highest priority)
- Fallback to last meaningful console.log
- Parse and format JSON for clean display
- Filter out all infrastructure noise

#### Full Console Logs Tab: Complete Execution Details
- Maintain existing functionality
- Show all console.log statements
- Include infrastructure logs for debugging
- Complete visibility into script execution

### 2. Implementation Strategy

#### Backend Enhancements

**Script Runner Service Updates:**
```javascript
// Track separate output streams
let scriptResult = null;
let lastConsoleLog = null;
let infrastructureLogs = [];

// Enhanced VM2 execution
vm.on('console.log', (...args) => {
  const message = args.join(' ');
  lastConsoleLog = message;
  
  // Route to appropriate output
  if (isInfrastructureLog(message)) {
    infrastructureLogs.push(message);
  }
  
  // Always send to Full Console Logs
  pushFullLog('stdout', message + '\n');
});

// Capture return value after execution
scriptResult = vm.result;

// Determine programmatic output
const programmaticOutput = determineProgrammaticOutput(scriptResult, lastConsoleLog);
```

**Database Schema Updates:**
```javascript
// Add to ScriptRun schema
{
  programmaticOutput: String,      // Clean result for API usage
  returnResult: String,            // Raw return value
  lastConsoleLog: String,          // Last console.log statement
  outputType: String,              // 'return' | 'console' | 'none'
  infrastructureLogs: String      // Infrastructure logs only
}
```

**New API Endpoints:**
```javascript
GET /api/admin/scripts/runs/:runId/programmatic-output
Response: {
  programmaticOutput: "Clean result",
  outputType: "return",
  isJson: true,
  parsedResult: { ... },
  metadata: { ... }
}
```

#### Frontend Refactoring

**Output Tab Logic:**
```javascript
// Load programmatic output instead of fullOutput
async function loadProgrammaticOutput(runId) {
  const response = await api(`/api/admin/scripts/runs/${runId}/programmatic-output`);
  displayProgrammaticOutput(response);
}

function displayProgrammaticOutput(data) {
  const outputElement = document.getElementById('output');
  
  if (data.isJson) {
    // Format JSON for clean display
    outputElement.textContent = JSON.stringify(data.parsedResult, null, 2);
    outputElement.className = 'p-3 text-xs font-mono whitespace-pre-wrap max-h-[40vh] overflow-auto json-output';
  } else {
    // Display as plain text
    outputElement.textContent = data.programmaticOutput;
    outputElement.className = 'p-3 text-xs font-mono whitespace-pre-wrap max-h-[40vh] overflow-auto';
  }
}
```

### 3. Output Determination Logic

#### Priority System
1. **Return Value** (highest priority)
   - Capture VM2 execution result
   - Format objects as JSON strings
   - Handle primitive types appropriately

2. **Last Console.log** (fallback)
   - Use last console.log if no return value
   - Filter out infrastructure logs
   - Parse JSON if stringified

3. **No Output** (final fallback)
   - Handle silent scripts
   - Provide meaningful default message

#### Implementation
```javascript
function determineProgrammaticOutput(returnValue, lastConsoleLog) {
  // Priority 1: Return value
  if (returnValue !== undefined && returnValue !== null) {
    const formatted = formatOutput(returnValue);
    return {
      programmaticOutput: formatted,
      outputType: 'return',
      isJson: isJsonString(formatted),
      parsedResult: tryParseJson(formatted)
    };
  }
  
  // Priority 2: Last meaningful console.log
  if (lastConsoleLog && !isInfrastructureLog(lastConsoleLog)) {
    return {
      programmaticOutput: lastConsoleLog,
      outputType: 'console',
      isJson: isJsonString(lastConsoleLog),
      parsedResult: tryParseJson(lastConsoleLog)
    };
  }
  
  // Priority 3: No output
  return {
    programmaticOutput: 'No output',
    outputType: 'none',
    isJson: false,
    parsedResult: null
  };
}
```

### 4. Infrastructure Log Filtering

#### Patterns to Filter
```javascript
const infrastructurePatterns = [
  'Using existing app database connection',
  'No existing connection found',
  'Auto-wrapping script in async function',
  '=== SCRIPT START ===',
  '=== SCRIPT END ===',
  'Executing script',
  'Script preview',
  'Database connection established',
  'chars)'
];
```

#### Smart Filtering
```javascript
function isInfrastructureLog(line) {
  return infrastructurePatterns.some(pattern => line.includes(pattern));
}

function isMeaningfulConsoleLog(line) {
  return !isInfrastructureLog(line) && 
         line.trim().length > 0 &&
         !line.startsWith('[') && // Skip timestamped logs
         !line.includes('==='); // Skip section markers
}
```

### 5. Implementation Steps

#### Phase 1: Backend Foundation
1. **Update ScriptRunner Service**
   - Add return value capture to VM2 execution
   - Implement last console.log tracking
   - Add infrastructure log filtering

2. **Database Schema Migration**
   - Add new fields to ScriptRun model
   - Create migration script for existing data
   - Update validation rules

3. **API Endpoint Development**
   - Create programmatic output endpoint
   - Update existing endpoints with new fields
   - Add response formatting logic

#### Phase 2: Frontend Refactoring
1. **Output Tab Updates**
   - Replace fullOutput with programmaticOutput
   - Implement smart JSON parsing and display
   - Add output type indicators

2. **Full Console Logs Maintenance**
   - Ensure existing functionality preserved
   - Add infrastructure log highlighting
   - Maintain search and filter features

#### Phase 3: Testing & Validation
1. **Script Type Testing**
   - Return value scripts
   - Console.log only scripts
   - Mixed output scripts
   - Silent scripts
   - Error scenarios

2. **API Consistency Validation**
   - Compare UI output with API responses
   - Test JSON parsing accuracy
   - Validate formatting consistency

### 6. Edge Cases Handling

#### Script Scenarios
1. **Object Return**: `return { status: "success", data: [...] }`
2. **String Return**: `return "Operation completed"`
3. **Console.log JSON**: `console.log({ result: "success" })`
4. **Console.log Text**: `console.log("Process complete")`
5. **Mixed Output**: Both return and console.log
6. **No Output**: Silent execution
7. **Error Output**: Exception with stack trace

#### Parsing Logic
```javascript
function formatOutput(value) {
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function isJsonString(str) {
  return tryParseJson(str) !== null;
}
```

### 7. User Experience Enhancements

#### Output Tab Features
- **JSON Syntax Highlighting**: For structured data
- **Output Type Indicator**: Show "Return Value" or "Console Output"
- **Copy to Clipboard**: Easy result copying
- **Raw/Formatted Toggle**: Switch between raw and formatted JSON

#### Full Console Logs Features
- **Infrastructure Log Highlighting**: Visual distinction
- **Log Level Filtering**: Separate infrastructure from application
- **Search Enhancement**: Search within log types
- **Export Options**: Export filtered logs

### 8. Technical Considerations

#### Performance
- **Minimal Overhead**: Efficient return value capture
- **Smart Caching**: Cache parsed JSON results
- **Lazy Loading**: Load programmatic output on demand

#### Compatibility
- **Backward Compatibility**: Existing scripts continue working
- **Graceful Degradation**: Fallback for edge cases
- **API Consistency**: Maintain existing response formats

#### Security
- **Output Sanitization**: Prevent XSS in JSON display
- **Size Limits**: Handle large return values
- **Error Handling**: Safe parsing and formatting

### 9. Success Criteria

#### Functional Requirements
- ✅ Output tab shows only clean programmatic results
- ✅ Return values take priority over console.log statements
- ✅ Infrastructure logs filtered from programmatic output
- ✅ JSON parsing and formatting works correctly
- ✅ Full console logs maintain complete visibility

#### API Consistency
- ✅ Programmatic output matches API consumer expectations
- ✅ JSON formatting consistent and predictable
- ✅ Backward compatibility maintained for existing integrations

#### User Experience
- ✅ Clean, readable output for programmatic use
- ✅ Complete debugging information available
- ✅ Clear distinction between output types
- ✅ Intuitive interface with proper visual hierarchy

### 10. Migration Strategy

#### Data Migration
```javascript
// Migration script for existing ScriptRun documents
async function migrateExistingRuns() {
  const runs = await ScriptRun.find({ 
    programmaticOutput: { $exists: false }
  });
  
  for (const run of runs) {
    // Extract programmatic output from existing fullOutput
    const programmaticOutput = extractProgrammaticOutput(run.fullOutput);
    
    await ScriptRun.updateOne(
      { _id: run._id },
      { 
        $set: {
          programmaticOutput: programmaticOutput.output,
          outputType: programmaticOutput.type,
          returnResult: programmaticOutput.returnValue,
          lastConsoleLog: programmaticOutput.lastConsole
        }
      }
    );
  }
}
```

#### Rollback Plan
- **Database Rollback**: Migration script to revert schema changes
- **Code Rollback**: Feature flags to disable new functionality
- **UI Rollback**: Fallback to original output display

This plan ensures clean separation between programmatic results and debugging information, providing the best experience for both API consumers and developers debugging scripts.
