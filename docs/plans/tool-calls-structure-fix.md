# Plan: Fix `toolCalls` Structure Mismatch in `AgentMessage`

**Date**: Feb 11, 2026  
**Status**: Planning  
**Priority**: High (Blocks LLM history compaction)

---

## Problem Analysis

### Current Situation

**AgentMessage Schema** (`src/models/AgentMessage.js`, line 27-31):
```javascript
toolCalls: [{
  name: String,
  arguments: mongoose.Schema.Types.Mixed,
  toolCallId: String
}]
```

**OpenAI Format** (from LLM response in `agent.service.js`, line 418, 431-432):
```javascript
// Response structure from LLM
{
  toolCalls: [
    {
      id: "call_xyz",
      function: {
        name: "tool_name",
        arguments: '{"param": "value"}'  // JSON string
      }
    }
  ]
}
```

**Current Bug**: `agent.service.js` passes OpenAI format directly to `appendMessages()` (line 425):
```javascript
toolCalls: toolCalls  // ← Directly from LLM response
```

This creates **Mongoose schema mismatch**:
- Schema expects: `{ name, arguments, toolCallId }`
- Received: `{ id, function: { name, arguments } }`
- Result: Empty subdocuments `[{ _id: ... }]` saved to DB

### Impact Chain

1. **`appendMessages()` receives malformed data** (line 80 in `agentHistory.service.js`)
   - No transformation of OpenAI format to schema format
   - Mongoose saves empty subdocs because field names don't match

2. **`getHistory()` returns empty toolCalls** (line 129-132)
   - Retrieves `msg.toolCalls` which are empty `[{ _id: ... }]`
   - LLM receives no tool results in history

3. **LLM can't process subsequent calls** (line 396 in `agent.service.js`)
   - Missing tool context causes errors during compaction
   - Tool call resolution fails

---

## Root Cause

**No transformation layer** between:
- **OpenAI format** (what LLM returns) → `{ id, function: { name, arguments } }`
- **Schema format** (what Mongoose expects) → `{ name, arguments, toolCallId }`

---

## Solution Design

### Data Flow Requirements

```
OpenAI Response
  ↓
[TRANSFORM in agent.service.js line 418-425]
  ↓
Schema Format
  ↓
[Store in appendMessages line 63-85]
  ↓
Mongoose AgentMessage
  ↓
[Retrieve in getHistory line 103-140]
  ↓
[TRANSFORM back for LLM use]
  ↓
LLM Context (OpenAI format)
```

### Approach: Transformation Functions

**Strategy**: Create bidirectional mappers to handle format conversions.

#### Option A: Handle in `agent.service.js` (Recommended)
- **Pro**: Transformation at source, closer to where data comes from
- **Pro**: LLM integration logic stays together
- **Con**: Requires modifying agent.service.js

#### Option B: Handle in `agentHistory.service.js`
- **Pro**: Centralized history logic
- **Con**: Less clear (data arrives already wrong)

#### Option C: Add Mongoose middleware
- **Pro**: Automatic transformation
- **Con**: Hidden behavior, harder to debug

**Recommendation**: **Option A + Option B** (dual approach)
- Transform IN at source (agent.service.js)
- Transform OUT when needed (agent.service.js when calling LLM)

---

## Implementation Plan

### Phase 1: Create Transformation Functions

**File**: `src/services/agentHistory.service.js`

**Add two new export functions**:

```javascript
/**
 * Convert OpenAI format { id, function: { name, arguments } }
 * to AgentMessage schema format { name, arguments, toolCallId }
 */
function transformOpenAIToolCallsToSchema(openAIToolCalls) {
  if (!Array.isArray(openAIToolCalls)) return [];
  
  return openAIToolCalls.map(call => ({
    name: call.function.name,
    arguments: (() => {
      try {
        return typeof call.function.arguments === 'string'
          ? JSON.parse(call.function.arguments)
          : call.function.arguments;
      } catch (e) {
        console.warn(`Failed to parse tool arguments for ${call.function.name}:`, e);
        return call.function.arguments;
      }
    })(),
    toolCallId: call.id
  }));
}

/**
 * Convert schema format { name, arguments, toolCallId }
 * back to OpenAI format { id, function: { name, arguments } }
 */
function transformSchemaToolCallsToOpenAI(schemaToolCalls) {
  if (!Array.isArray(schemaToolCalls) || schemaToolCalls.length === 0) return [];
  
  return schemaToolCalls.map(call => ({
    id: call.toolCallId,
    function: {
      name: call.name,
      arguments: typeof call.arguments === 'string'
        ? call.arguments
        : JSON.stringify(call.arguments)
    }
  }));
}
```

**Export**: Add to module.exports at line 251.

---

### Phase 2: Update `appendMessages()` Function

**File**: `src/services/agentHistory.service.js`, lines 63-98

**Current behavior**:
- Accepts messages directly from agent.service.js
- Stores OpenAI format (wrong) to Mongoose

**Updated behavior**:
- Detect if incoming `toolCalls` are in OpenAI format
- Transform to schema format before storing
- Validate transformation

**Code change**:
```javascript
async function appendMessages(agentId, chatId, messages) {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { success: true, insertedCount: 0 };
    }

    const existingCount = await AgentMessage.countDocuments({ agentId, chatId });
    if (existingCount === 0) {
      await migrateSessionHistory(agentId, chatId);
    }

    const messagesWithMetadata = messages.map(msg => {
      let toolCalls = msg.toolCalls || [];
      
      // TRANSFORM: If toolCalls contain OpenAI format, convert to schema format
      if (toolCalls.length > 0 && toolCalls[0].id && toolCalls[0].function) {
        console.log('[agentHistory] Transforming OpenAI toolCalls to schema format');
        toolCalls = transformOpenAIToolCallsToSchema(toolCalls);
      }
      
      return {
        agentId,
        chatId,
        role: msg.role,
        content: msg.content,
        toolCalls,  // Now in schema format
        toolCallId: msg.toolCallId,
        metadata: msg.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });

    const result = await AgentMessage.insertMany(messagesWithMetadata);
    
    return { 
      success: true, 
      insertedCount: result.length,
      messages: result
    };
  } catch (err) {
    console.error('Error appending messages to history:', err);
    throw err;
  }
}
```

---

### Phase 3: Update `getHistory()` Function

**File**: `src/services/agentHistory.service.js`, lines 103-140

**Current behavior**:
- Returns schema format `{ name, arguments, toolCallId }`
- LLM code in agent.service.js expects OpenAI format

**Updated behavior**:
- Return messages WITH tool_calls in OpenAI format for LLM use
- Maintain backward compatibility by keeping toolCalls field

**Code change**:
```javascript
async function getHistory(agentId, chatId, limit = 20) {
  try {
    let messages = await AgentMessage.find({ agentId, chatId })
      .sort({ createdAt: 1 })
      .lean();

    if (messages.length === 0) {
      const jsonConfigKey = await getHistoryJsonConfigKey(agentId, chatId);
      const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const legacyConfig = await jsonConfigsService.getJsonConfig(normalizedKey).catch(() => null);

      if (legacyConfig && legacyConfig.history) {
        console.log(`[agent.service] Serving legacy history from JsonConfig for ${chatId}`);
        const startIndex = Math.max(0, legacyConfig.history.length - limit);
        return legacyConfig.history.slice(startIndex);
      }
      return [];
    }

    const startIndex = Math.max(0, messages.length - limit);
    messages = messages.slice(startIndex);

    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
      // ADD: OpenAI format for LLM use
      tool_calls: transformSchemaToolCallsToOpenAI(msg.toolCalls),
      toolCallId: msg.toolCallId,
      metadata: msg.metadata
    }));
  } catch (err) {
    console.error('Error loading history:', err);
    return [];
  }
}
```

---

### Phase 4: Update `agent.service.js` to Use Transformed Data

**File**: `src/services/agent.service.js`

**Location 1**: Line 394-396 (building messages for LLM)

**Current**:
```javascript
const messages = [
  { role: 'system', content: systemPrompt },
  ...history
];
```

**Updated**: Use `tool_calls` from history instead of `toolCalls`:
```javascript
const messages = [
  { role: 'system', content: systemPrompt },
  ...history.map(msg => ({
    ...msg,
    // For assistant messages with tool calls, use OpenAI format
    tool_calls: msg.tool_calls || msg.toolCalls  // Fallback for compatibility
  }))
];
```

**Location 2**: Line 428 (storing assistant message with toolCalls)

**Current**:
```javascript
const assistantMsg = { 
  role: 'assistant', 
  content: text || null,
  toolCalls: toolCalls // Store as camelCase for AgentMessage
};
// Keep snake_case for LLM context
history.push({ ...assistantMsg, tool_calls: toolCalls });
```

**Updated**: No change needed - already has both formats. But ensure `appendMessages` gets OpenAI format:
```javascript
const assistantMsg = { 
  role: 'assistant', 
  content: text || null,
  toolCalls: toolCalls  // OpenAI format - will be transformed in appendMessages
};
history.push(assistantMsg);
```

(Actually, line 428 already does this correctly - `toolCalls` is the OpenAI response)

---

### Phase 5: Verification Steps

**Test 1: Format Detection**
- Verify transformation recognizes OpenAI format (has `id` and `function` fields)
- Verify transformation recognizes schema format (has `name`, `arguments`, `toolCallId`)

**Test 2: Data Integrity**
- Tool call ID preserved: `call.id` → `toolCallId`
- Tool name preserved: `call.function.name` → `name`
- Arguments preserved and parsed: `call.function.arguments` → `arguments` (parsed JSON)

**Test 3: Round-trip**
- OpenAI → Schema → OpenAI should result in equivalent structure
- Arguments should survive JSON stringify/parse cycle

**Test 4: LLM Integration**
- History passed to LLM has `tool_calls` in correct format
- LLM can parse tool calls and parameters
- Subsequent tool execution works

**Test 5: Database**
- No empty subdocuments `[{ _id: ... }]` saved
- `toolCalls` array contains full objects with all fields

---

## Files to Modify

### Summary Table

| File | Function | Change | Lines | Type |
|------|----------|--------|-------|------|
| `agentHistory.service.js` | N/A | Add transform functions | New | Feature |
| `agentHistory.service.js` | `appendMessages` | Add format detection & transform | 63-98 | Fix |
| `agentHistory.service.js` | `getHistory` | Return tool_calls in OpenAI format | 103-140 | Enhancement |
| `agentHistory.service.js` | `getFullHistory` | Same as getHistory | 142-173 | Enhancement |
| `agentHistory.service.js` | module.exports | Export transform functions | 251-262 | Feature |
| `agent.service.js` | `processMessage` | Use tool_calls from history | ~394 | Enhancement |

---

## Rollback Strategy

If issues arise:
1. **Comment out transformations** in `appendMessages` (line ~80)
   - System returns to broken state but won't crash
2. **Remove tool_calls from getHistory** return (line ~132)
   - LLM won't have tool context but won't crash
3. **No schema migration needed** - old data stays as-is

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Arguments not JSON string | ParseError on transform | Try/catch, fallback to original |
| Missing fields in OpenAI format | TypeError | Check `call.id && call.function` before transform |
| Tool call ID collision | Wrong tool routing | Preserve exact `call.id` value |
| Backward compat with legacy data | Data mismatch | Check schema format first, transform only if needed |
| Performance on large histories | Slow transform | Transform is O(n), acceptable for typical history size |

---

## Success Criteria

- ✅ No empty `toolCalls` subdocuments saved to DB
- ✅ `getHistory()` returns complete toolCall objects
- ✅ LLM receives tool_calls in correct OpenAI format
- ✅ Tool execution completes without errors
- ✅ History compaction works end-to-end
- ✅ Zero breaking changes to API contracts

---

## Open Questions

1. **Should transformation happen in `agent.service.js` instead?**
   - Current plan: Do it in `agentHistory.service.js` as a safety layer
   - Pro: Consistent, centralized
   - Con: May be redundant if agent.service already has the data

2. **For legacy JsonConfig history, what format is it in?**
   - Need to verify line 120: does `legacyConfig.history` use old format?
   - May need transformation there too

3. **Should we add a migration script for existing broken data?**
   - Current plan: No - leave old empty docs, only fix going forward
   - Alternative: Add cleanup script to remove/fix empty toolCalls docs

4. **Performance: Is checking `toolCalls[0].id` on every message OK?**
   - Expected impact: Negligible (array length check is O(1))
   - Only one condition check per message

---

## Implementation Order

1. **Step 1**: Add transformation functions to `agentHistory.service.js`
2. **Step 2**: Update `appendMessages()` with format detection & transform
3. **Step 3**: Update `getHistory()` to return both formats
4. **Step 4**: Update `getFullHistory()` for consistency
5. **Step 5**: Update module.exports with new functions
6. **Step 6**: Test with small example flow
7. **Step 7**: Verify no regressions in agent conversation

---

## Estimated Effort

- **Analysis**: 30 min (complete)
- **Code changes**: 45 min (transform functions + updates)
- **Testing**: 30 min (format conversion, database save, history retrieval)
- **Documentation**: 15 min (inline comments, this document)
- **Total**: ~2 hours

---

## Related Issues

- Mongoose saves empty subdocuments when field names don't match schema
- LLM compaction fails due to missing tool context
- Agent agentic loops can't properly resolve tool calls

---

## Sign-off

**Reviewed by**: Self (Plan phase)  
**Approved by**: Pending user review  
**Implementation start**: TBD
