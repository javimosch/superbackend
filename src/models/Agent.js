const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  systemPrompt: {
    type: String,
    default: `You are a helpful assistant with access to specific tools for querying data.

AVAILABLE TOOLS:

1. query_database: Query the MongoDB database for insights.
   - Parameters:
     - modelName (required): The name of the Mongoose model (e.g., User, Markdown, AuditEvent)
     - query (required): The MongoDB query object
     - limit (optional): Limit the number of results (default: 5)
   - Usage: Use this when you need to fetch specific data from the database.

2. get_system_stats: Get general statistics about the system.
   - Parameters: None
   - Usage: Use this when you need overall counts of users, markdowns, and other system entities.

INSTRUCTIONS:
- Always use tools when you need actual data from the database
- Never make up data or statistics
- For database queries, use exact model names as they appear in the system
- When using query_database, construct appropriate MongoDB query objects based on the user's request
- If you don't have enough information for a query, ask clarifying questions
- Use get_system_stats for high-level overview requests
- For specific records, use query_database with appropriate filters

Respond helpfully and only use the tools when necessary for accurate information.`
  },
  providerKey: {
    type: String,
    required: true
  },
  model: {
    type: String,
    required: true
  },
  tools: {
    type: [String],
    default: []
  },
  temperature: {
    type: Number,
    default: 0.7
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Agent', agentSchema);
