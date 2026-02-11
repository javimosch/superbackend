# Quick Reference: Session History Storage Solution

## Problem
**Current**: Session history stored in single `JsonConfig` document → hits 16MB MongoDB limit
**Issue**: `MAX_HISTORY = 20` truncates history (causes data loss)

## Recommended Solution
**Use Strategy 1: Dedicated AgentMessage Collection**

## Quick Implementation

### 1. Create AgentMessage Model
```javascript
// src/models/AgentMessage.js
const agentMessageSchema = new mongoose.Schema({
  agentId: { type: ObjectId, ref: 'Agent', required: true, index: true },
  chatId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'assistant', 'system', 'tool'], required: true },
  content: { type: String },
  toolCalls: { type: Array },
  toolCallId: { type: String },
  metadata: { type: Object },
  createdAt: { type: Date, default: Date.now, index: true }
});
agentMessageSchema.index({ agentId: 1, chatId: 1, createdAt: 1 });
```

### 2. Update agentHistory.service.js
```javascript
// New functions
async function appendMessages(agentId, chatId, messages) {
  // Insert new messages only
  return AgentMessage.insertMany(messages);
}

async function getHistory(agentId, chatId, limit = 20) {
  // Get recent messages for LLM context
  return AgentMessage.find({ agentId, chatId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}
```

### 3. Update agent.service.js
```javascript
// In processMessage():
// Instead of: await saveHistory(agentId, chatId, slicedHistory)
// Use: await appendMessages(agentId, chatId, [newUserMessage, newAssistantMessage])
```

## Migration Strategy
1. **Dual-Write**: Write to both JsonConfig AND AgentMessage
2. **Backfill**: Convert existing JsonConfig data to AgentMessage
3. **Cutover**: Switch reads to AgentMessage
4. **Cleanup**: Remove JsonConfig history entries

## Benefits
- ✅ Infinite history size
- ✅ Fast "last N messages" retrieval
- ✅ Searchable history
- ✅ No data loss
- ✅ Aligns with existing patterns

## Migration Status
- **Current**: Using single JsonConfig document
- **Risk**: 16MB limit will be hit eventually
- **Action**: Implement AgentMessage collection
- **Timeline**: 2-3 weeks for complete migration

## Files to Create/Modify
1. **New**: `src/models/AgentMessage.js`
2. **Modify**: `src/services/agentHistory.service.js`
3. **Modify**: `src/services/agent.service.js`
4. **Create**: Migration script
5. **Update**: Documentation (this file)

## Testing Checklist
- [ ] Unit tests for AgentMessage model
- [ ] Integration tests for history storage
- [ ] Migration script tests
- [ ] Performance tests
- [ ] Rollback tests

## Rollback Plan
If issues arise:
1. Switch reads back to JsonConfig
2. AgentMessage data remains as backup
3. Manual sync if needed

## Success Criteria
- ✅ No data loss during migration
- ✅ Zero downtime
- ✅ <100ms query performance
- ✅ Support 10,000+ sessions
- ✅ Enable history search feature

## Next Steps
1. Create AgentMessage model (Day 1)
2. Update agentHistory service (Day 2-3)
3. Write tests (Day 4)
4. Create migration script (Day 5)
5. Test on staging (Week 2)
6. Deploy to production (Week 3)

## Questions to Answer
1. What's the average message size per session?
2. How many active sessions daily?
3. Do we need history search feature?
4. What's the retention policy?
5. Any compliance requirements for history data?