# Implementation Summary: toolCalls Structure Fix

## Problem
- **OpenAI format**: `[{ id, function: { name, arguments } }]`
- **Schema expects**: `[{ name, arguments, toolCallId }]`
- **Result**: Empty Mongoose subdocuments `[{ _id: ... }]`
- **Impact**: LLM can't process tool calls, history compaction fails

## Solution
Add transformation layer in `agentHistory.service.js` to convert between formats.

---

## Code Changes (Minimal)

### 1. Add Transform Functions (at end of agentHistory.service.js, before module.exports)

```javascript
/**
 * OpenAI format: { id, function: { name, arguments } }
 * → Schema format: { name, arguments, toolCallId }
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
        console.warn(`Failed to parse tool args: ${e.message}`);
        return call.function.arguments;
      }
    })(),
    toolCallId: call.id
  }));
}

/**
 * Schema format: { name, arguments, toolCallId }
 * → OpenAI format: { id, function: { name, arguments } }
 */
function transformSchemaToolCallsToOpenAI(schemaToolCalls) {
  if (!Array.isArray(schemaToolCalls)) return [];
  
  return schemaToolCalls
    .filter(call => call.toolCallId) // Skip invalid entries
    .map(call => ({
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

### 2. Update `appendMessages()` Function (lines 63-98)

**Key change**: Add transformation detection at line ~80

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
      
      // CRITICAL: Transform OpenAI format to schema format
      if (toolCalls.length > 0 && toolCalls[0]?.id && toolCalls[0]?.function) {
        console.log('[agentHistory] Transforming OpenAI toolCalls to schema format');
        toolCalls = transformOpenAIToolCallsToSchema(toolCalls);
      }
      
      return {
        agentId,
        chatId,
        role: msg.role,
        content: msg.content,
        toolCalls,  // Now properly formatted
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

### 3. Update `getHistory()` Function (lines 103-140)

**Key change**: Return both `toolCalls` and `tool_calls` for compatibility

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
        console.log(`[agentHistory] Serving legacy history from JsonConfig for ${chatId}`);
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
      // NEW: Return tool_calls in OpenAI format for LLM use
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

### 4. Update `getFullHistory()` Function (lines 142-173)

Same pattern as getHistory():

```javascript
async function getFullHistory(agentId, chatId, skip = 0, limit = 100) {
  try {
    const [messages, total] = await Promise.all([
      AgentMessage.find({ agentId, chatId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AgentMessage.countDocuments({ agentId, chatId })
    ]);

    return {
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        toolCalls: msg.toolCalls,
        // NEW: Return tool_calls in OpenAI format
        tool_calls: transformSchemaToolCallsToOpenAI(msg.toolCalls),
        toolCallId: msg.toolCallId,
        metadata: msg.metadata,
        createdAt: msg.createdAt
      })),
      pagination: {
        total,
        skip,
        limit,
        hasMore: skip + limit < total
      }
    };
  } catch (err) {
    console.error('Error loading full history:', err);
    return { messages: [], pagination: { total: 0, skip, limit, hasMore: false } };
  }
}
```

### 5. Update module.exports (line 251+)

Add the two transform functions to exports:

```javascript
module.exports = {
  getHistoryJsonConfigKey,
  appendMessages,
  getHistory,
  getFullHistory,
  searchHistory,
  deleteHistory,
  getHistoryStats,
  saveHistory,
  loadHistory,
  migrateCacheOnlyHistories,
  // NEW:
  transformOpenAIToolCallsToSchema,
  transformSchemaToolCallsToOpenAI
};
```

---

## Files Modified

1. **`src/services/agentHistory.service.js`** (ONLY file to change)
   - Add 2 transform functions (~35 lines)
   - Update `appendMessages()` with format detection (~5 lines added)
   - Update `getHistory()` to return tool_calls (~2 lines added)
   - Update `getFullHistory()` same as getHistory (~2 lines added)
   - Export new functions (2 lines in module.exports)
   - **Total additions**: ~45 lines, 0 deletions

2. **No changes needed in**:
   - `agent.service.js` - works as-is with transformations
   - `AgentMessage.js` - schema stays the same
   - Any other files

---

## Testing Checklist

- [ ] Transform OpenAI → Schema format correctly
- [ ] Transform Schema → OpenAI format correctly
- [ ] Arguments JSON parse/stringify survives round-trip
- [ ] Tool call ID preserved (call.id → toolCallId)
- [ ] getHistory returns non-empty toolCalls
- [ ] LLM receives tool_calls in correct format
- [ ] No empty subdocuments saved to DB
- [ ] Agent can execute tools after history retrieval
- [ ] Conversation completes without tool errors
- [ ] History compaction works end-to-end

---

## Verification Script (Node.js)

```javascript
const { transformOpenAIToolCallsToSchema, transformSchemaToolCallsToOpenAI } = require('./src/services/agentHistory.service');

// Test data
const openAIFormat = [
  {
    id: "call_abc123",
    function: {
      name: "fetch_data",
      arguments: '{"url":"https://example.com","timeout":5000}'
    }
  }
];

const schemaFormat = [
  {
    name: "fetch_data",
    arguments: { url: "https://example.com", timeout: 5000 },
    toolCallId: "call_abc123"
  }
];

// Test 1: OpenAI → Schema
const transformed1 = transformOpenAIToolCallsToSchema(openAIFormat);
console.log('Transform 1:', JSON.stringify(transformed1, null, 2));
assert(transformed1[0].toolCallId === "call_abc123");
assert(transformed1[0].name === "fetch_data");
assert(typeof transformed1[0].arguments === 'object');

// Test 2: Schema → OpenAI
const transformed2 = transformSchemaToolCallsToOpenAI(schemaFormat);
console.log('Transform 2:', JSON.stringify(transformed2, null, 2));
assert(transformed2[0].id === "call_abc123");
assert(transformed2[0].function.name === "fetch_data");
assert(typeof transformed2[0].function.arguments === 'string');

// Test 3: Round-trip
const roundTrip = transformSchemaToolCallsToOpenAI(transformOpenAIToolCallsToSchema(openAIFormat));
console.log('Round-trip:', JSON.stringify(roundTrip, null, 2));
assert.deepEqual(roundTrip[0], openAIFormat[0]);

console.log('✅ All tests passed');
```

---

## Rollback

If needed, simply revert `agentHistory.service.js` to previous version. No schema changes, no migrations needed.

---

## Notes

- **Backward compatible**: Existing data unaffected
- **No migration needed**: Old documents stay as-is
- **Safe format detection**: Checks `[0]?.id && [0]?.function` before transforming
- **Explicit logging**: Logs when transformation occurs for debugging
- **Defensive parsing**: Try/catch on JSON.parse with fallback
