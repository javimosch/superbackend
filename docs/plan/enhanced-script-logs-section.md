# Plan: Enhanced Script Logs Section for Admin UI

## Overview
Add a dedicated "Full Console Logs" section to the admin scripts UI to display complete script execution logs, addressing the current issue where the output field shows truncated content and misses important script results.

## Current Problem Analysis

### Issue Description
- **Current Output Field**: Shows truncated console tail, missing actual bot processing results
- **Missing Content**: Bot health check results, summary statistics, and detailed processing information
- **User Experience**: Users cannot see complete script execution results in the UI

### Current Behavior
```
Current Output (truncated):
🔍 Bot Health Monitor - Execution Started
Timestamp: 2026-02-11T04:56:11.750Z
Configuration: {"autoDisable":true,"dryRun":false,"verbose":true}
Database connection established
=== SCRIPT END ===
```

### Expected Full Output
```
Expected Complete Output:
🔍 Bot Health Monitor - Execution Started
Timestamp: 2026-02-11T04:56:11.750Z
Configuration: {"autoDisable":true,"dryRun":false,"verbose":true}
Database connection established
Found 3 enabled paper trading bots
🚨 Bot Arbitrage Spread Bot - $100 Paper failed health check: MAX_LOSSES_EXCEEDED
🔴 Disabled bot Arbitrage Spread Bot - $100 Paper : MAX_LOSSES_EXCEEDED
✅ Bot Arbitrage Spread Bot - $100 Paper (2026-02-10T14-40-00) : Balance $37.08 , 10 open positions
✅ Bot SOLANA HOURLY SCALPER v5 -  Paper Account : Balance $100.00 , 0 open positions
🔍 Health Monitor Summary:
   Total bots checked: 3
   ✅ Healthy: 2
   🚨 Disabled: 1
   ❌ Errors: 0
   Mode: AUTO DISABLE
   Timestamp: 2026-02-11T04:56:11.750Z
=== SCRIPT END ===
```

## Root Cause Analysis

### Technical Issues Identified
1. **Output Tail Limitation**: `outputTail` field in ScriptRun model may have size constraints
2. **UI Display Limitation**: Output field has `max-h-[40vh]` limiting visible content
3. **Streaming vs Final**: Real-time streaming may not capture all final output
4. **Buffer Management**: Console output buffering might truncate long scripts

### Current UI Structure
- Single output section with limited height (40vh)
- No dedicated full logs view
- No download/export functionality
- No search/filter capabilities for logs

## Proposed Solution

### 1. Enhanced UI Layout

#### New Section Structure
```
┌─ Output Section (Current) ─┐
│ [Quick Output]              │
│ Limited to 40vh height     │
│ Shows recent/summary view  │
└────────────────────────────┘

┌─ Full Console Logs Section ─┐
│ [Complete Logs]             │
│ Expandable full height       │
│ Search and filter options    │
│ Download/export buttons      │
└────────────────────────────┘
```

#### UI Components to Add
1. **Tabs/Toggle**: Switch between "Quick Output" and "Full Logs"
2. **Expandable Panel**: Full-height logs display
3. **Search Bar**: Search within log content
4. **Filter Options**: Filter by log level (stdout/stderr)
5. **Export Buttons**: Download logs as text file
6. **Auto-scroll Toggle**: Control automatic scrolling
7. **Line Numbers**: Optional line number display
8. **Timestamp Highlighting**: Visual distinction for timestamps

### 2. Backend Enhancements

#### ScriptRun Model Updates
```javascript
// Add new fields to ScriptRun schema
{
  fullOutput: String,        // Complete console output (no size limit)
  outputSize: Number,        // Total output size in characters
  lineCount: Number,        // Total number of lines
  lastUpdated: Date,        // Last output update timestamp
}
```

#### Script Runner Service Updates
```javascript
// Enhanced output capture
function pushLog(stream, line) {
  // Update existing outputTail (for compatibility)
  tail = appendTail(tail, s);
  
  // Also update fullOutput (new field)
  if (!runDoc.fullOutput) runDoc.fullOutput = '';
  runDoc.fullOutput += s;
  
  // Update metadata
  runDoc.outputSize = runDoc.fullOutput.length;
  runDoc.lineCount = runDoc.fullOutput.split('\n').length;
  runDoc.lastUpdated = new Date();
  
  // Batch update to reduce DB calls
  if (shouldBatchUpdate()) {
    batchUpdateOutput(runId, runDoc);
  }
}
```

### 3. API Enhancements

#### New Endpoints
```javascript
// Get full script output
GET /api/admin/scripts/runs/:runId/full-output
Response: {
  fullOutput: String,
  lineCount: Number,
  outputSize: Number,
  downloadUrl: String
}

// Download logs as file
GET /api/admin/scripts/runs/:runId/download
Response: File download (text/plain)
```

#### Enhanced Streaming
```javascript
// Enhanced SSE with full output support
GET /api/admin/scripts/runs/:runId/stream?full=true
Events: log, status, done, error, full_output_chunk
```

### 4. Frontend Implementation

#### New HTML Structure
```html
<!-- Enhanced Output Section -->
<div class="mt-4 bg-white border border-gray-200 rounded-lg">
  <!-- Tab Navigation -->
  <div class="p-3 border-b border-gray-200">
    <div class="flex items-center justify-between">
      <nav class="flex space-x-4">
        <button class="output-tab active" data-tab="quick">Quick Output</button>
        <button class="output-tab" data-tab="full">Full Console Logs</button>
      </nav>
      <div class="flex items-center gap-2">
        <button id="btn-download-logs" class="text-sm text-gray-600 hover:underline">Download</button>
        <button id="btn-clear-logs" class="text-sm text-gray-600 hover:underline">Clear</button>
      </div>
    </div>
  </div>
  
  <!-- Quick Output Tab -->
  <div id="quick-output" class="output-tab-content">
    <pre id="output" class="p-3 text-xs font-mono whitespace-pre-wrap max-h-[40vh] overflow-auto"></pre>
  </div>
  
  <!-- Full Logs Tab -->
  <div id="full-output" class="output-tab-content hidden">
    <!-- Search Bar -->
    <div class="p-3 border-b border-gray-200">
      <div class="flex items-center gap-2">
        <input type="text" id="log-search" placeholder="Search logs..." class="flex-1 px-2 py-1 border rounded text-sm">
        <select id="log-filter" class="px-2 py-1 border rounded text-sm">
          <option value="all">All Logs</option>
          <option value="stdout">Stdout</option>
          <option value="stderr">Stderr</option>
        </select>
        <button id="btn-auto-scroll" class="px-2 py-1 bg-gray-100 rounded text-sm">Auto-scroll</button>
      </div>
    </div>
    
    <!-- Full Logs Display -->
    <div class="relative">
      <pre id="full-logs-content" class="p-3 text-xs font-mono whitespace-pre-wrap" style="height: 60vh; overflow: auto;"></pre>
      <div id="log-line-numbers" class="absolute left-0 top-0 p-3 text-xs font-mono text-gray-400" style="height: 60vh; overflow: hidden;"></div>
    </div>
  </div>
</div>
```

#### JavaScript Implementation
```javascript
// Tab switching
document.querySelectorAll('.output-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    switchOutputTab(tabName);
  });
});

// Full logs loading
async function loadFullLogs(runId) {
  try {
    const response = await api(`/api/admin/scripts/runs/${runId}/full-output`);
    displayFullLogs(response.fullOutput);
  } catch (error) {
    console.error('Failed to load full logs:', error);
  }
}

// Search functionality
document.getElementById('log-search').addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  filterLogs(searchTerm);
});

// Download functionality
document.getElementById('btn-download-logs').addEventListener('click', () => {
  downloadLogs(currentRunId);
});
```

## Implementation Steps

### Phase 1: Backend Foundation
1. **ScriptRun Model Updates**
   - Add `fullOutput`, `outputSize`, `lineCount`, `lastUpdated` fields
   - Update existing migration scripts
   - Add database indexes for performance

2. **Script Runner Service Enhancement**
   - Modify `pushLog()` function to capture full output
   - Implement batch updating to reduce DB calls
   - Add output size monitoring and limits

3. **API Endpoints**
   - Add `/full-output` endpoint
   - Add `/download` endpoint
   - Enhance existing streaming endpoint

### Phase 2: Frontend Implementation
1. **UI Structure Updates**
   - Add tab navigation to output section
   - Implement full logs panel with search/filter
   - Add export functionality

2. **JavaScript Functionality**
   - Tab switching logic
   - Full logs loading and display
   - Search and filter implementation
   - Download functionality

3. **Enhanced Streaming**
   - Update SSE client to handle full output
   - Implement progressive loading for large logs
   - Add real-time search updates

### Phase 3: User Experience Enhancements
1. **Performance Optimization**
   - Implement virtual scrolling for large logs
   - Add lazy loading for log chunks
   - Optimize search performance

2. **Accessibility Improvements**
   - Add keyboard navigation
   - Implement screen reader support
   - Add high contrast mode

3. **Advanced Features**
   - Log syntax highlighting
   - Error detection and highlighting
   - Log analytics and insights

## Technical Considerations

### Performance
- **Memory Management**: Large logs could consume significant memory
- **Database Storage**: Full output storage requirements
- **Network Transfer**: Large log files transfer optimization

### Storage Strategy
- **Database Storage**: Store full output in MongoDB with compression
- **File Storage**: Option to store large logs in filesystem
- **Retention Policy**: Automatic cleanup of old log data

### Security
- **Access Control**: Ensure proper authorization for log access
- **Data Sanitization**: Prevent XSS in log display
- **Privacy**: Handle sensitive data in logs appropriately

## Success Criteria

### Functional Requirements
- ✅ Complete script output visible in UI
- ✅ Search and filter functionality working
- ✅ Download/export functionality available
- ✅ Performance acceptable for large logs
- ✅ Backward compatibility maintained

### User Experience Requirements
- ✅ Intuitive tab navigation
- ✅ Responsive design for different screen sizes
- ✅ Fast loading and smooth interactions
- ✅ Clear visual hierarchy and readability

### Technical Requirements
- ✅ No performance degradation for existing features
- ✅ Proper error handling and edge cases
- ✅ Scalable solution for high-volume usage
- ✅ Maintainable and extensible code structure

## Testing Strategy

### Unit Tests
- ScriptRun model updates
- API endpoint functionality
- JavaScript utility functions

### Integration Tests
- End-to-end script execution with full logging
- API integration with frontend
- Database performance with large outputs

### User Acceptance Tests
- UI usability testing
- Performance testing with large scripts
- Accessibility compliance testing

## Deployment Plan

### Rollout Strategy
1. **Backend Deployment**: Deploy API and model changes first
2. **Frontend Deployment**: Deploy UI updates after backend verification
3. **Feature Flag**: Implement feature flag for gradual rollout
4. **Monitoring**: Add monitoring for new features

### Migration Considerations
- **Existing Data**: Migration script for existing ScriptRun documents
- **Backward Compatibility**: Ensure existing functionality continues working
- **Rollback Plan**: Clear rollback strategy if issues arise

## Future Enhancements

### Advanced Features
- **Log Analytics**: Parse and analyze log patterns
- **Alert Integration**: Automatic error detection and alerts
- **Log Comparison**: Compare outputs between script runs
- **Collaboration**: Share and comment on script outputs

### Performance Optimizations
- **Caching**: Implement intelligent caching for frequently accessed logs
- **Compression**: Advanced compression for log storage
- **Streaming**: Real-time log streaming for long-running scripts
