const mongoose = require('mongoose');

const tools = {
  query_database: {
    description: 'Query the MongoDB database for insights. Use Mongoose model names.',
    parameters: {
      type: 'object',
      properties: {
        modelName: {
          type: 'string',
          description: 'The name of the Mongoose model (e.g., User, Markdown, AuditEvent)'
        },
        query: {
          type: 'object',
          description: 'The MongoDB query object'
        },
        limit: {
          type: 'number',
          description: 'Limit the number of results',
          default: 5
        }
      },
      required: ['modelName', 'query']
    },
    execute: async ({ modelName, query, limit = 5 }) => {
      try {
        const Model = mongoose.model(modelName);
        if (!Model) throw new Error(`Model ${modelName} not found`);

        const results = await Model.find(query).limit(limit).lean();
        return JSON.stringify(results, null, 2);
      } catch (err) {
        return `Error executing query: ${err.message}`;
      }
    }
  },
  get_system_stats: {
    description: 'Get general statistics about the system (counts of users, markdowns, etc.)',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async () => {
      try {
        const stats = {};
        const models = mongoose.modelNames();
        for (const name of models) {
          stats[name] = await mongoose.model(name).countDocuments();
        }
        return JSON.stringify(stats, null, 2);
      } catch (err) {
        return `Error getting stats: ${err.message}`;
      }
    }
  }
};

async function executeTool(name, args) {
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not found`);
  console.log(`Executing tool ${name} with args:`, args);
  return await tool.execute(args);
}

function getToolDefinitions() {
  return Object.entries(tools).map(([name, tool]) => ({
    type: 'function',
    function: {
      name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

module.exports = {
  executeTool,
  getToolDefinitions
};
