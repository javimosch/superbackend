# Visual Diff: agentHistory.service.js Changes

## File: src/services/agentHistory.service.js

### Change 1: Add Transform Functions (INSERT before line 237, before module.exports)

**Location**: Between `migrateCacheOnlyHistories()` and `module.exports`

```javascript
/**
 * Transform OpenAI LLM format to Mongoose schema format
 * 
 * OpenAI: { id, function: { name, arguments } }
 * Schema: { name, arguments, toolCallId }
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
        console.warn(`[agentHistory] Failed to parse tool arguments for ${call.function.name}:`, e);
        return call.function.arguments;
      }
    })(),
    toolCallId: call.id
  }));
}

/**
 * Transform schema format back to OpenAI format
 * 
 * Schema: { name, arguments, toolCallId }
 * OpenAI: { id, function: { name, arguments } }
 */
function transformSchemaToolCallsToOpenAI(schemaToolCalls) {
  if (!Array.isArray(schemaToolCalls) || schemaToolCalls.length === 0) return [];
  
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

---

### Change 2: Update `appendMessages()` Function (lines 63-98)

**Location**: Line ~80 (inside the map function, before creating return object)

```diff
  const messagesWithMetadata = messages.map(msg => {
+   let toolCalls = msg.toolCalls || [];
+   
+   // CRITICAL FIX: Transform OpenAI format to schema format
+   // OpenAI sends: [{ id, function: { name, arguments } }]
+   // Schema expects: [{ name, arguments, toolCallId }]
+   if (toolCalls.length > 0 && toolCalls[0]?.id && toolCalls[0]?.function) {
+     console.log('[agentHistory] Transforming OpenAI toolCalls to schema format for', agentId);
+     toolCalls = transformOpenAIToolCallsToSchema(toolCalls);
+   }
+   
    return {
      agentId,
      chatId,
      role: msg.role,
      content: msg.content,
-     toolCalls: msg.toolCalls || [],
+     toolCalls,  // Now properly formatted
      toolCallId: msg.toolCallId,
      metadata: msg.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });
```

---

### Change 3: Update `getHistory()` Function (lines 103-140)

**Location**: Line ~129-135 (in the map function that returns messages)

```diff
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls,
+   // TRANSFORM: Return tool_calls in OpenAI format for LLM use
+   tool_calls: transformSchemaToolCallsToOpenAI(msg.toolCalls),
    toolCallId: msg.toolCallId,
    metadata: msg.metadata
  }));
```

---

### Change 4: Update `getFullHistory()` Function (lines 142-173)

**Location**: Line ~154-160 (in the messages.map function)

```diff
  return {
    messages: messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
+     // TRANSFORM: Return tool_calls in OpenAI format for LLM use
+     tool_calls: transformSchemaToolCallsToOpenAI(msg.toolCalls),
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
```

---

### Change 5: Update module.exports (line 251+)

**Location**: Line ~251-262 at the bottom

```diff
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
    migrateCacheOnlyHistories
+   transformOpenAIToolCallsToSchema,
+   transformSchemaToolCallsToOpenAI
  };
```

---

## Summary of Changes

| Change | Lines | Type | Reason |
|--------|-------|------|--------|
| Add transformOpenAIToolCallsToSchema | ~30 | Addition | Convert LLM format → Schema format |
| Add transformSchemaToolCallsToOpenAI | ~25 | Addition | Convert Schema format → LLM format |
| appendMessages detection | ~8 | Modification | Transform before storing |
| getHistory tool_calls | ~1 | Modification | Return LLM format |
| getFullHistory tool_calls | ~1 | Modification | Return LLM format |
| module.exports | ~2 | Modification | Export transform functions |
| **TOTAL** | **~67** | **6 changes** | **1 file modified** |

---

## Before/After Data Flow

### BEFORE (Broken)
```
agent.service.js response
  toolCalls: [{ id, function: { name, arguments } }]  ← OpenAI format
         ↓
appendMessages() [DOES NO TRANSFORM]
         ↓
Mongoose saves
  toolCalls: [{ _id: ??? }]  ← EMPTY! Fields don't match
         ↓
getHistory() returns
  toolCalls: []  ← Empty array!
         ↓
agent.service.js LLM call
  tool_calls: undefined or []  ← No tool context!
         ↓
LLM can't process tool results ❌
```

### AFTER (Fixed)
```
agent.service.js response
  toolCalls: [{ id, function: { name, arguments } }]  ← OpenAI format
         ↓
appendMessages() [TRANSFORMS]
  toolCalls: [{ name, arguments, toolCallId }]  ← Schema format ✅
         ↓
Mongoose saves
  toolCalls: [{ name, arguments, toolCallId, _id: ... }]  ← COMPLETE ✅
         ↓
getHistory() returns
  toolCalls: [{ name, arguments, toolCallId }]
  tool_calls: [{ id, function: { name, arguments } }]  ← OpenAI format ✅
         ↓
agent.service.js LLM call receives
  tool_calls: [{ id, function: { name, arguments } }]  ← Correct format ✅
         ↓
LLM processes tool results ✅
```

---

## Critical Points

⚠️ **Format Detection Logic** (appendMessages, line ~84):
```javascript
if (toolCalls.length > 0 && toolCalls[0]?.id && toolCalls[0]?.function)
```
- Checks if OpenAI format
- Only transforms if needed
- Safe: Won't transform twice

⚠️ **Graceful Fallback** (JSON parsing, line ~77):
```javascript
try {
  return typeof call.function.arguments === 'string'
    ? JSON.parse(call.function.arguments)
    : call.function.arguments;
} catch (e) {
  console.warn(...);
  return call.function.arguments;  // Keep as-is if parse fails
}
```
- Won't crash on bad JSON
- Logs warning for debugging
- Preserves original value

⚠️ **Filter Invalid Entries** (transformSchemaToolCallsToOpenAI, line ~251):
```javascript
.filter(call => call.toolCallId)  // Skip invalid entries
```
- Prevents null IDs in returned array
- Protects downstream LLM processing

---

## No Changes Needed In

✅ `src/models/AgentMessage.js` - Schema stays identical  
✅ `src/services/agent.service.js` - Works automatically with transformations  
✅ `src/controllers/*` - No changes to API contracts  
✅ Database - No migrations needed  
✅ Tests - Existing tests should pass  

---

## Verification Commands

```bash
# After implementing, run:

# 1. Check syntax
node -c src/services/agentHistory.service.js

# 2. Check exports exist
node -e "const s = require('./src/services/agentHistory.service'); console.log(typeof s.transformOpenAIToolCallsToSchema, typeof s.transformSchemaToolCallsToOpenAI)"

# 3. Test transformation manually
node -e "
const { transformOpenAIToolCallsToSchema } = require('./src/services/agentHistory.service');
const openAI = [{ id: 'call_1', function: { name: 'foo', arguments: '{\"x\":1}' } }];
const schema = transformOpenAIToolCallsToSchema(openAI);
console.log(JSON.stringify(schema, null, 2));
console.log('✅ Transform works' && schema[0].toolCallId === 'call_1' && schema[0].arguments.x === 1);
"
```

---

## Rollback Strategy

If issues occur:

1. **Revert file**:
   ```bash
   git checkout src/services/agentHistory.service.js
   ```

2. **No database migration needed** - old documents stay as-is

3. **No schema changes** - can switch back and forth

4. **Timeline**: Revert takes <1 min, zero data loss
