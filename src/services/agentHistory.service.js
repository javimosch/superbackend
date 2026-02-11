const mongoose = require('mongoose');
const AgentMessage = require('../models/AgentMessage');
const jsonConfigsService = require('./jsonConfigs.service');
const JsonConfig = require('../models/JsonConfig');

const HISTORY_JSON_CONFIG_PREFIX = 'agent-history-';

async function getHistoryJsonConfigKey(agentId, chatId) {
  return `${HISTORY_JSON_CONFIG_PREFIX}${agentId}-${chatId}`;
}

/**
 * Transform OpenAI tool calls format to Schema format
 * OpenAI: { id, type, function: { name, arguments } }
 * Schema: { name, arguments: Mixed, toolCallId }
 */
function transformOpenAIToolCallsToSchema(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  
  return toolCalls.map(tc => {
    // If it's already in schema format (has toolCallId), return as is
    if (tc.toolCallId) return tc;
    
    // If it's in OpenAI format
    if (tc.id && tc.function) {
      let args = tc.function.arguments;
      // Try to parse arguments if they are a string
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch (e) {
          // Keep as string if parsing fails
        }
      }
      
      return {
        name: tc.function.name,
        arguments: args,
        toolCallId: tc.id
      };
    }
    
    // Fallback/Unknown format
    return tc;
  });
}

/**
 * Transform Schema tool calls format to OpenAI format
 * Schema: { name, arguments: Mixed, toolCallId }
 * OpenAI: { id, type, function: { name, arguments } }
 */
function transformSchemaToolCallsToOpenAI(toolCalls) {
  if (!Array.isArray(toolCalls)) return undefined;
  if (toolCalls.length === 0) return undefined; // OpenAI prefers undefined over empty array for some models
  
  return toolCalls.map(tc => {
    // If it's already in OpenAI format (has id and function), return as is
    if (tc.id && tc.function) return tc;
    
    // If it's in Schema format (has toolCallId)
    if (tc.toolCallId) {
      return {
        id: tc.toolCallId,
        type: 'function',
        function: {
          name: tc.name,
          arguments: typeof tc.arguments === 'object' ? JSON.stringify(tc.arguments) : String(tc.arguments || '')
        }
      };
    }
    
    // Fallback
    return tc;
  });
}

/**
 * Helper to migrate history from JsonConfig to AgentMessage
 */
async function migrateSessionHistory(agentId, chatId) {
  try {
    const jsonConfigKey = await getHistoryJsonConfigKey(agentId, chatId);
    const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const config = await JsonConfig.findOne({
      $or: [
        { slug: normalizedKey },
        { alias: normalizedKey }
      ]
    }).lean();

    if (!config || !config.jsonRaw) return false;

    const historyData = JSON.parse(config.jsonRaw);
    if (!historyData.history || !Array.isArray(historyData.history) || historyData.history.length === 0) {
      return false;
    }

    const messages = historyData.history.map((msg, index) => ({
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
      // Stagger timestamps if not present
      createdAt: new Date(Date.now() - (historyData.history.length - index) * 1000),
      updatedAt: new Date()
    }));

    await AgentMessage.insertMany(messages);
    console.log(`[agent.service] Migrated ${messages.length} messages from JsonConfig for ${chatId}`);
    return true;
  } catch (err) {
    console.error(`[agent.service] Failed to migrate history for ${chatId}:`, err);
    return false;
  }
}

/**
 * Append new messages to session history
 * Handles lazy migration if needed
 */
async function appendMessages(agentId, chatId, messages) {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { success: true, insertedCount: 0 };
    }

    // Check if we need to migrate existing history first
    const existingCount = await AgentMessage.countDocuments({ agentId, chatId });
    if (existingCount === 0) {
      await migrateSessionHistory(agentId, chatId);
    }

    const messagesWithMetadata = messages.map(msg => ({
      agentId,
      chatId,
      role: msg.role,
      content: msg.content,
      // Ensure toolCalls are transformed to Schema format
      toolCalls: transformOpenAIToolCallsToSchema(msg.toolCalls || []),
      toolCallId: msg.toolCallId,
      metadata: msg.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date()
    }));

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

/**
 * Get recent messages for LLM context window
 */
async function getHistory(agentId, chatId, limit = 20) {
  try {
    // Try AgentMessage first
    let messages = await AgentMessage.find({ agentId, chatId })
      .sort({ createdAt: 1 })
      .lean();

    // If no messages found, try legacy JsonConfig
    if (messages.length === 0) {
      const jsonConfigKey = await getHistoryJsonConfigKey(agentId, chatId);
      const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const legacyConfig = await jsonConfigsService.getJsonConfig(normalizedKey).catch(() => null);

      if (legacyConfig && legacyConfig.history) {
        console.log(`[agent.service] Serving legacy history from JsonConfig for ${chatId}`);
        // Apply limit to legacy history
        const startIndex = Math.max(0, legacyConfig.history.length - limit);
        return legacyConfig.history.slice(startIndex);
      }
      return [];
    }

    // Apply limit to the result
    const startIndex = Math.max(0, messages.length - limit);
    messages = messages.slice(startIndex);

    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      // Transform Schema format back to OpenAI format
      tool_calls: transformSchemaToolCallsToOpenAI(msg.toolCalls),
      toolCalls: transformSchemaToolCallsToOpenAI(msg.toolCalls),
      tool_call_id: msg.toolCallId,
      toolCallId: msg.toolCallId,
      metadata: msg.metadata
    }));
  } catch (err) {
    console.error('Error loading history:', err);
    return [];
  }
}

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
        tool_calls: transformSchemaToolCallsToOpenAI(msg.toolCalls),
        toolCalls: transformSchemaToolCallsToOpenAI(msg.toolCalls),
        tool_call_id: msg.toolCallId,
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
      matchScore: msg.score
    }));
  } catch (err) {
    console.error('Error searching history:', err);
    return [];
  }
}

async function deleteHistory(agentId, chatId) {
  try {
    const result = await AgentMessage.deleteMany({ agentId, chatId });
    return { success: true, deletedCount: result.deletedCount };
  } catch (err) {
    console.error('Error deleting history:', err);
    throw err;
  }
}

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

// Deprecated functions for backward compatibility
async function saveHistory(agentId, chatId, history) {
  console.warn('[agent.service] Deprecated saveHistory called. Use appendMessages instead.');
  // We can't safely implement overwrite with append-only model without deleting everything first.
  return { success: false, error: 'Deprecated' }; 
}

// Alias loadHistory to getHistory for backward compatibility
const loadHistory = getHistory;

async function migrateCacheOnlyHistories() {
  return { migrated: 0, failed: 0, deprecated: true };
}

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
  transformOpenAIToolCallsToSchema,
  transformSchemaToolCallsToOpenAI
};