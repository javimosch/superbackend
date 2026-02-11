# Code Snippets: Session History Storage Implementation

## 1. AgentMessage Model (src/models/AgentMessage.js)

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
    arguments: mongoose.Schema.Types.Mixed,
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
    timestamp: Date,
    temperature: Number
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for efficient session history retrieval
agentMessageSchema.index(
  { agentId: 1, chatId: 1, createdAt: 1 },
  { name: 'session_history_idx' }
);

// Index for tool call lookup
agentMessageSchema.index(
  { toolCallId: 1 },
  { name: 'tool_call_idx' }
);

// Index for searching content
agentMessageSchema.index(
  { content: 'text' },
  { name: 'content_search_idx' }
);

module.exports = mongoose.model('AgentMessage', agentMessageSchema);
```

## 2. Updated agentHistory.service.js

```javascript
const AgentMessage = require('../models/AgentMessage');

const HISTORY_JSON_CONFIG_PREFIX = 'agent-history-';

async function getHistoryJsonConfigKey(agentId, chatId) {
  return `${HISTORY_JSON_CONFIG_PREFIX}${agentId}-${chatId}`;
}

/**
 * Append new messages to session history
 * @param {string} agentId - Agent ID
 * @param {string} chatId - Chat session ID
 * @param {Array} messages - Array of message objects to append
 * @returns {Promise<Object>} - Result with success flag and inserted count
 */
async function appendMessages(agentId, chatId, messages) {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    // Add metadata to each message
    const messagesWithMetadata = messages.map(msg => ({
      agentId,
      chatId,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls || [],
      toolCallId: msg.toolCallId,
      metadata: msg.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const result = await AgentMessage.insertMany(messagesWithMetadata);
    
    console.log(`[agent.service] Appended ${result.length} messages to history for chat ${chatId}`);
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

/**
 * Get recent messages for LLM context window
 * @param {string} agentId - Agent ID
 * @param {string} chatId - Chat session ID
 * @param {number} limit - Number of messages to retrieve (default: 20)
 * @returns {Promise<Array>} - Array of messages in chronological order
 */
async function getHistory(agentId, chatId, limit = 20) {
  try {
    const messages = await AgentMessage.find({ agentId, chatId })
      .sort({ createdAt: 1 }) // Chronological order for LLM context
      .limit(limit)
      .lean();

    if (messages.length === 0) {
      console.log(`[agent.service] No history found for chat ${chatId}`);
      return [];
    }

    console.log(`[agent.service] Loaded ${messages.length} messages from history for chat ${chatId}`);
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
      toolCallId: msg.toolCallId,
      metadata: msg.metadata
    }));
  } catch (err) {
    console.error('Error loading history:', err);
    return [];
  }
}

/**
 * Get complete session history for export/analysis
 * @param {string} agentId - Agent ID
 * @param {string} chatId - Chat session ID
 * @param {number} skip - Number of messages to skip (for pagination)
 * @param {number} limit - Number of messages per page
 * @returns {Promise<Object>} - Messages and pagination info
 */
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

/**
 * Search messages by content or metadata
 * @param {string} agentId - Agent ID
 * @param {string} chatId - Chat session ID
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Matching messages
 */
async function searchHistory(agentId, chatId, query, options = {}) {
  try {
    const { limit = 20, skip = 0 } = options;
    
    const messages = await AgentMessage.find({
      agentId,
      chatId,
      $text: { $search: query }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
      matchScore: msg.score // From text index
    }));
  } catch (err) {
    console.error('Error searching history:', err);
    return [];
  }
}

/**
 * Delete session history
 * @param {string} agentId - Agent ID
 * @param {string} chatId - Chat session ID
 * @returns {Promise<Object>} - Deletion result
 */
async function deleteHistory(agentId, chatId) {
  try {
    const result = await AgentMessage.deleteMany({ agentId, chatId });
    console.log(`[agent.service] Deleted ${result.deletedCount} messages for chat ${chatId}`);
    return { success: true, deletedCount: result.deletedCount };
  } catch (err) {
    console.error('Error deleting history:', err);
    throw err;
  }
}

/**
 * Get message statistics for a session
 * @param {string} agentId - Agent ID
 * @param {string} chatId - Chat session ID
 * @returns {Promise<Object>} - Session statistics
 */
async function getHistoryStats(agentId, chatId) {
  try {
    const stats = await AgentMessage.aggregate([
      { $match: { agentId: new mongoose.Types.ObjectId(agentId), chatId } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          userMessages: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
          assistantMessages: { $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] } },
          toolMessages: { $sum: { $cond: [{ $eq: ['$role', 'tool'] }, 1, 0] } },
          totalTokens: { $sum: '$metadata.tokens' },
          avgResponseTime: { $avg: '$metadata.processingTime' },
          firstMessage: { $min: '$createdAt' },
          lastMessage: { $max: '$createdAt' }
        }
      }
    ]);

    return stats[0] || null;
  } catch (err) {
    console.error('Error getting history stats:', err);
    return null;
  }
}

module.exports = {
  getHistoryJsonConfigKey,
  appendMessages,
  getHistory,
  getFullHistory,
  searchHistory,
  deleteHistory,
  getHistoryStats
};
```

## 3. Updated agent.service.js Integration

```javascript
// In processMessage():
async function processMessage(agentId, { content, senderId, chatId: inputChatId, metadata = {} }) {
  try {
    const agent = await Agent.findById(agentId);
    if (!agent) throw new Error('Agent not found');

    const chatId = inputChatId || crypto.randomUUID();
    
    await ensureAgentMemory(agent);
    await getOrCreateSession(agentId, chatId);

    const contextLength = await llmService.getModelContextLength(agent.model, agent.providerKey);
    const systemPrompt = await getSystemPrompt(agent, chatId);

    // Get recent history for LLM context (limited to context window)
    let history = await agentHistoryService.getHistory(agentId, chatId, contextLength);

    // Add new user message
    history.push({ role: 'user', content });

    // Get LLM response
    const { response, usage } = await llmService.generateResponse({
      model: agent.model,
      providerKey: agent.providerKey,
      systemPrompt,
      messages: history,
      maxTokens: agent.maxTokens,
      temperature: agent.temperature
    });

    // Add assistant response to history
    const assistantMessage = {
      role: 'assistant',
      content: response,
      metadata: {
        tokens: usage.totalTokens,
        processingTime: usage.processingTime,
        model: agent.model,
        provider: agent.providerKey
      }
    };

    // Save ONLY the new messages to history (append)
    await agentHistoryService.appendMessages(agentId, chatId, [
      { role: 'user', content },
      assistantMessage
    ]);

    // Return response
    return {
      text: response,
      usage: usage,
      chatId
    };
  } catch (err) {
    console.error('Agent processMessage error:', err);
    throw err;
  }
}
```

## 4. Migration Script

```javascript
// scripts/migrate-history-to-agent-message.js
const mongoose = require('mongoose');
const JsonConfig = require('../src/models/JsonConfig');
const AgentMessage = require('../src/models/AgentMessage');
const agentHistoryService = require('../src/services/agentHistory.service');

async function migrateHistoryToAgentMessage() {
  console.log('Starting history migration...');
  
  let processed = 0;
  let migrated = 0;
  let failed = 0;

  try {
    // Find all history JsonConfig documents
    const historyConfigs = await JsonConfig.find({
      alias: { $regex: /^agent-history-/ }
    }).lean();

    console.log(`Found ${historyConfigs.length} history documents to migrate`);

    for (const config of historyConfigs) {
      try {
        processed++;
        
        // Parse the stored history
        const historyData = JSON.parse(config.jsonRaw);
        
        if (!historyData.history || !Array.isArray(historyData.history)) {
          console.warn(`Skipping invalid history for config ${config._id}`);
          failed++;
          continue;
        }

        const { agentId, chatId, history } = historyData;

        // Convert to AgentMessage documents
        const messages = history.map((msg, index) => ({
          agentId,
          chatId,
          role: msg.role,
          content: msg.content,
          toolCalls: msg.toolCalls || [],
          toolCallId: msg.toolCallId,
          metadata: msg.metadata || {
            tokens: msg.tokens || 0,
            timestamp: config.createdAt || new Date()
          },
          createdAt: new Date(Date.now() - (history.length - index) * 1000), // Staggered timestamps
          updatedAt: new Date(Date.now() - (history.length - index) * 1000)
        }));

        // Batch insert for better performance
        await AgentMessage.insertMany(messages, { ordered: false });
        
        // Mark as migrated (optional: could delete old config)
        config.migrated = true;
        await JsonConfig.updateOne(
          { _id: config._id },
          { $set: { migrated: true, migratedAt: new Date() } }
        );

        migrated++;
        
        if (processed % 100 === 0) {
          console.log(`Progress: ${processed}/${historyConfigs.length} processed, ${migrated} migrated, ${failed} failed`);
        }
      } catch (err) {
        console.error(`Failed to migrate config ${config._id}:`, err);
        failed++;
      }
    }

    console.log(`\nMigration complete:`);
    console.log(`- Processed: ${processed}`);
    console.log(`- Migrated: ${migrated}`);
    console.log(`- Failed: ${failed}`);

    return { processed, migrated, failed };
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saas-backend')
    .then(() => migrateHistoryToAgentMessage())
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrateHistoryToAgentMessage };
```

## 5. Query Examples

```javascript
// Get recent messages for LLM context
const history = await agentHistoryService.getHistory(agentId, chatId, 20);

// Get complete session history (paginated)
const fullHistory = await agentHistoryService.getFullHistory(agentId, chatId, 0, 100);

// Search for specific content
const searchResults = await agentHistoryService.searchHistory(
  agentId, 
  chatId, 
  'function call',
  { limit: 10 }
);

// Get session statistics
const stats = await agentHistoryService.getHistoryStats(agentId, chatId);

// Delete session history
await agentHistoryService.deleteHistory(agentId, chatId);
```

## 6. Performance Optimizations

```javascript
// Add to model indexes
agentMessageSchema.index(
  { agentId: 1, chatId: 1, createdAt: -1 },
  { name: 'recent_messages_idx' }
);

// For date range queries
agentMessageSchema.index(
  { agentId: 1, chatId: 1, createdAt: 1 },
  { name: 'date_range_idx' }
);

// For tool call lookup
agentMessageSchema.index(
  { toolCallId: 1, createdAt: 1 },
  { name: 'tool_call_with_time_idx' }
);
```

## 7. Rollback Plan

```javascript
// If migration fails, restore from JsonConfig
async function restoreFromJsonConfig(agentId, chatId) {
  const historyKey = `agent-history-${agentId}-${chatId}`;
  const config = await JsonConfig.findOne({ alias: historyKey }).lean();
  
  if (config && config.jsonRaw) {
    const historyData = JSON.parse(config.jsonRaw);
    // Reinsert into AgentMessage or fall back to JsonConfig
  }
}
```