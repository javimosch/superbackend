# Session History Storage Strategy - Implementation Plan

## Problem Statement

The current session history storage approach will eventually hit MongoDB's 16MB document size limit when storing indefinite session history. Currently:

1. **Current Implementation**: Entire conversation history stored in a single `JsonConfig` document
2. **Limitation**: Each session's history is limited to 16MB (MongoDB document size limit)
3. **Risk**: As conversations grow, they will exceed this limit
4. **Current Workaround**: `MAX_HISTORY = 20` truncates history before save (causing data loss)

## Analysis Results

Based on comprehensive analysis of the codebase and requirements:

### MongoDB Limitations
- **Document Size Limit**: 16MB maximum per document
- **Text Storage**: ~10,000-50,000 simple text messages
- **With Rich Content**: Significantly fewer messages (tool outputs, metadata)
- **Current Growth Rate**: Unknown, but with LLM responses being lengthy, growth is exponential

### Architecture Patterns in Codebase
- **ActivityLog/AuditEvent**: Already use "one document per event" pattern
- **Mongoose ODM**: Well-established in the project
- **JsonConfig**: Generic key-value store (not optimized for streaming data)

## Alternative Strategies

### Strategy 1: Dedicated AgentMessage Collection (RECOMMENDED)
Create a specialized Mongoose model where each message is a separate document.

**Pros:**
- ✅ **Infinite Scalability**: Limited only by disk space
- ✅ **Performance**: Efficient "last N messages" retrieval
- ✅ **Standards**: Aligns with MongoDB best practices for chat data
- ✅ **Querying**: Easy to search, filter, analyze specific tool usages
- ✅ **Architecture**: Consistent with existing `ActivityLog` pattern

**Cons:**
- ❌ Requires database migration
- ❌ Slightly more complex save logic (append vs overwrite)

**Estimated Complexity:** Medium (requires new model, service updates, migration)

### Strategy 2: Bucketing/Pagination in JsonConfig
Split history into multiple `JsonConfig` documents (e.g., `history-page-1`, `history-page-2`).

**Pros:**
- ✅ No new Mongoose model required
- ✅ Keeps all data within existing abstraction

**Cons:**
- ❌ **High Complexity**: Managing page pointers, boundaries, concurrency
- ❌ **Performance**: Reading "last 20 messages" may require fetching large JSON chunks
- ❌ **Fragile**: Harder to query or debug specific messages
- ❌ **Inefficient**: Multiple reads for single session history

**Estimated Complexity:** High (complex page management logic)

### Strategy 3: Hybrid S3 Archival
Keep active history in `JsonConfig`, move older messages to S3 JSON files.

**Pros:**
- ✅ **Cost**: Cheapest storage for massive histories
- ✅ **Scalability**: Unlimited history size

**Cons:**
- ❌ **Latency**: Slow for full history retrieval
- ❌ **Complexity**: "Read-Modify-Write" on S3 is slow and expensive
- ❌ **Consistency**: Risk of data loss during transfers
- ❌ **Not Real-time**: Poor for real-time chat scenarios

**Estimated Complexity:** Very High (complex hybrid system)

### Strategy 4: Hybrid MongoDB + S3 (Optimized)
Active messages in MongoDB (last 1000), archived in S3 (older messages).

**Pros:**
- ✅ **Balance**: Fast access to recent history, cheap storage for old
- ✅ **Performance**: Real-time chat unaffected
- ✅ **Cost**: Reduced MongoDB storage costs

**Cons:**
- ❌ **Complexity**: Dual storage management
- ❌ **Migration**: Need background archival process
- ❌ **Read Pattern**: Need to fetch from two sources for full history

**Estimated Complexity:** Very High (two storage systems)

### Strategy 5: Optimized JsonConfig with Compression
Store history in compressed format, split across multiple documents if needed.

**Pros:**
- ✅ **Simplicity**: Minimal code changes
- ✅ **Compression**: Reduces storage size 3-10x

**Cons:**
- ❌ **Still Limited**: Compression doesn't solve 16MB limit, just pushes it
- ❌ **Decompression Overhead**: CPU cost for every read/write
- ❌ **Complexity**: Compression logic adds maintenance burden

**Estimated Complexity:** Low-Medium

## Recommendation

**STRATEGY 1: Dedicated AgentMessage Collection** is the recommended approach.

### Rationale
1. **Future-Proof**: Handles indefinite history growth
2. **Performance**: Optimized for the primary use case (fetching recent messages)
3. **Maintainability**: Clean separation of concerns
4. **Scalability**: Aligns with established patterns in the codebase
5. **Features**: Enables advanced querying, analytics, and search capabilities

### Implementation Phases

#### Phase 1: New Model & Service
1. Create `AgentMessage` model
2. Update `agentHistory.service.js` to use new model
3. Maintain dual-write capability temporarily

#### Phase 2: Migration
1. Create migration script to convert existing `JsonConfig` data
2. Run migration in production
3. Switch reads to new model

#### Phase 3: Cleanup
1. Remove old `JsonConfig` history entries
2. Remove dual-write logic
3. Update documentation

#### Phase 4: Optimization
1. Add indexing strategies
2. Implement history pruning/archival (optional)
3. Add query performance monitoring

## Detailed Implementation Plan

### Step 1: Create AgentMessage Model

**File:** `src/models/AgentMessage.js`

```javascript
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const agentMessageSchema = new mongoose.Schema({
  agentId: {
    type: ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },
  chatId: {
    type: String,
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system', 'tool'],
    required: true
  },
  content: {
    type: String,
    required: function() {
      return this.role !== 'tool';
    }
  },
  toolCalls: [{
    name: String,
    arguments: Object,
    toolCallId: String
  }],
  toolCallId: {
    type: String,
    index: true
  },
  metadata: {
    tokens: Number,
    processingTime: Number,
    model: String,
    provider: String,
    timestamp: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Compound index for efficient session history retrieval
agentMessageSchema.index(
  { agentId: 1, chatId: 1, createdAt: 1 },
  { name: 'session_history_idx' }
);

// Index for tool calls
agentMessageSchema.index(
  { toolCallId: 1 },
  { name: 'tool_call_idx' }
);

module.exports = mongoose.model('AgentMessage', agentMessageSchema);
```

### Step 2: Update agentHistory.service.js

**Key Changes:**
1. Replace `saveHistory()` with `appendMessages()`
2. Replace `loadHistory()` with `getHistory()` (with limit parameter)
3. Add `getFullHistory()` for complete history retrieval
4. Add `searchHistory()` for advanced querying

**New Function Signatures:**
```javascript
// Appends new messages to history
async function appendMessages(agentId, chatId, messages)

// Gets recent messages (for LLM context window)
async function getHistory(agentId, chatId, limit = 20)

// Gets all messages (for exports/analysis)
async function getFullHistory(agentId, chatId)

// Search messages by content or metadata
async function searchHistory(agentId, chatId, query, options)
```

### Step 3: Update agent.service.js

**Changes:**
1. Modify `processMessage()` to append only new messages
2. Update `compactSession()` to work with new storage
3. Remove `MAX_HISTORY` truncation before save (keep for LLM context window only)

### Step 4: Migration Strategy

**Approach:** Zero-downtime migration with dual-write

**Phase A: Dual-Write Setup**
1. Update code to write to both `JsonConfig` and `AgentMessage`
2. Continue reading from `JsonConfig` (fallback to `AgentMessage` if needed)

**Phase B: Backfill Migration**
1. Create migration script
2. Process all `JsonConfig` documents with `agent-history-` prefix
3. Parse `jsonRaw` and create `AgentMessage` documents
4. Track progress and handle failures

**Phase C: Cutover**
1. Switch reads to `AgentMessage`
2. Verify data integrity
3. Remove dual-write logic

### Step 5: Testing Strategy

1. **Unit Tests**: Model validation, service functions
2. **Integration Tests**: Message storage/retrieval flows
3. **Migration Tests**: Verify data conversion accuracy
4. **Performance Tests**: Compare query performance
5. **Load Tests**: Simulate high-volume chat scenarios

## Migration Path

### Current State
```javascript
// JsonConfig document structure
{
  _id: ObjectId,
  jsonRaw: JSON.stringify({
    agentId: "...",
    chatId: "...",
    history: [message1, message2, ..., message20],
    lastUpdated: "...",
    size: 20
  })
}
```

### Future State
```javascript
// AgentMessage documents (one per message)
[
  { agentId, chatId, role: 'user', content: '...', createdAt: '...' },
  { agentId, chatId, role: 'assistant', content: '...', createdAt: '...' },
  { agentId, chatId, role: 'user', content: '...', createdAt: '...' },
  // ... potentially thousands of documents per session
]
```

## Data Retention Policy

**Recommendation:** Implement configurable retention policy.

1. **Default**: Keep last 1000 messages per session
2. **Archival**: Move older messages to cold storage (optional)
3. **Deletion**: Configurable retention period (e.g., 90 days)

## Performance Considerations

### Query Optimization
1. **Compound Index**: `(agentId, chatId, createdAt)` for session history
2. **Pagination**: Cursor-based pagination for large histories
3. **Projection**: Select only needed fields (content, role, metadata)
4. **Caching**: Cache recent sessions in Redis if needed

### Storage Optimization
1. **Compression**: Optional gzip compression for `content` field
2. **Archiving**: Move old sessions to cheaper storage
3. **Indexing**: Regular index maintenance

## Security Considerations
1. **Data Isolation**: Ensure `agentId` is validated on every query
2. **Access Control**: RBAC checks before allowing history access
3. **Encryption**: Encrypt sensitive content at rest (if needed)
4. **Audit Trail**: Log history access for compliance

## Rollback Plan

If issues arise during migration:
1. **Immediate Rollback**: Switch reads back to `JsonConfig`
2. **Data Recovery**: `AgentMessage` documents remain as backup
3. **Data Sync**: Manual sync if needed between storage systems

## Success Metrics

1. **Storage Efficiency**: 90% reduction in storage per session
2. **Query Performance**: <100ms for 20-message context window
3. **Scalability**: Support 1000+ concurrent sessions
4. **Reliability**: 99.9% history availability

## Next Steps

1. **Phase 1 Implementation** (Week 1-2):
   - Create `AgentMessage` model
   - Update `agentHistory.service.js`
   - Add dual-write capability
   - Write unit tests

2. **Phase 2 Migration** (Week 3):
   - Create migration script
   - Test on staging environment
   - Deploy to production with monitoring

3. **Phase 3 Optimization** (Week 4):
   - Performance tuning
   - Index optimization
   - Monitoring setup
   - Documentation updates

## Conclusion

The dedicated `AgentMessage` collection strategy provides the best balance of scalability, performance, and maintainability. It solves the 16MB limit permanently while enabling advanced features like history search, analytics, and efficient retrieval of recent messages for the LLM context window.

The migration can be performed with zero downtime using a dual-write approach, ensuring data integrity throughout the transition.