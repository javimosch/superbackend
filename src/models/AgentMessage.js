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
      // Content is not required if:
      // 1. Role is 'tool' (content might be in metadata or implied) - though usually tool has content
      // 2. Role is 'assistant' AND it has toolCalls (OpenAI often returns null content with tool calls)
      if (this.role === 'tool') return false;
      if (this.role === 'assistant' && this.toolCalls && this.toolCalls.length > 0) return false;
      return true;
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
