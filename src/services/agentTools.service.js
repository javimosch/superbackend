const mongoose = require('mongoose');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

function createErrorResponse(error, options = {}) {
  const {
    code = 100,
    type = 'internal_error',
    recoverable = false,
    retryAfter = null,
    suggestions = [],
    context = {}
  } = options;

  return JSON.stringify({
    error: {
      code,
      type,
      message: error.message || String(error),
      recoverable,
      retry_after: retryAfter,
      suggestions,
      context,
      _raw: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  }, null, 2);
}

const ERROR_CODES = {
  INVALID_INPUT: 80,
  MISSING_REQUIRED: 81,
  PERMISSION_DENIED: 82,
  NOT_FOUND: 92,
  ALREADY_EXISTS: 93,
  CONFLICT: 94,
  CONNECTION_TIMEOUT: 105,
  SERVICE_UNAVAILABLE: 106,
  AUTH_FAILED: 107,
  INTERNAL_ERROR: 110,
  BUG: 111
};

const tools = {
  'mongo-memory': {
    description: 'Persistent virtual cognitive space for the agent. Read, write, append, search, and list files in your memory workspace.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['list', 'read', 'write', 'append', 'search'],
          description: 'The memory operation to perform'
        },
        filename: {
          type: 'string',
          description: 'The name of the file (e.g., USER.md, TASKS.md). Required for read, write, append.'
        },
        content: {
          type: 'string',
          description: 'The content to write or append. Required for write, append.'
        },
        group_code: {
          type: 'string',
          description: 'Optional subfolder (e.g., archived, snapshots). Do NOT include the agent name prefix.'
        },
        query: {
          type: 'string',
          description: 'Search query across all agent memory files. Required for search.'
        }
      },
      required: ['operation']
    },
    execute: async ({ operation, filename, content, group_code, query }, { agent }) => {
      try {
        if (!agent || !agent.name) throw new Error('Agent context missing');
        
        const Markdown = mongoose.model('Markdown');
        const CATEGORY = 'agents_memory';
        const agentPrefix = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        // Resolve target group_code
        let targetGroupCode = agentPrefix;
        if (group_code) {
          const sub = String(group_code).trim().replace(/^__+/, '');
          if (sub) targetGroupCode = `${agentPrefix}__${sub}`;
        }

        switch (operation) {
          case 'list': {
            const docs = await Markdown.find({ 
              category: CATEGORY, 
              group_code: targetGroupCode 
            }).select('slug title updatedAt').lean();
            
            return JSON.stringify({
              group_code: targetGroupCode,
              files: docs.map(d => ({ filename: d.slug + '.md', title: d.title, updatedAt: d.updatedAt }))
            }, null, 2);
          }

          case 'read': {
            if (!filename) throw new Error('filename is required for read');
            const slug = filename.replace(/\.md$/i, '');
            const doc = await Markdown.findOne({
              category: CATEGORY,
              group_code: targetGroupCode,
              slug
            }).lean();
            
            if (!doc) throw new Error(`File ${filename} not found in ${targetGroupCode}`);
            return doc.markdownRaw;
          }

          case 'write': {
            if (!filename) throw new Error('filename is required for write');
            if (content === undefined) throw new Error('content is required for write');
            const slug = filename.replace(/\.md$/i, '');
            
            const markdownsService = require('./markdowns.service');
            await markdownsService.upsertMarkdown({
              title: filename,
              category: CATEGORY,
              group_code: targetGroupCode,
              slug,
              markdownRaw: content,
              status: 'published'
            });
            
            return `File ${filename} written successfully to ${targetGroupCode}`;
          }

          case 'append': {
            if (!filename) throw new Error('filename is required for append');
            if (content === undefined) throw new Error('content is required for append');
            const slug = filename.replace(/\.md$/i, '');
            
            const doc = await Markdown.findOne({
              category: CATEGORY,
              group_code: targetGroupCode,
              slug
            });
            
            const existingContent = doc ? doc.markdownRaw : '';
            const newContent = existingContent ? `${existingContent}\n${content}` : content;
            
            const markdownsService = require('./markdowns.service');
            await markdownsService.upsertMarkdown({
              title: filename,
              category: CATEGORY,
              group_code: targetGroupCode,
              slug,
              markdownRaw: newContent,
              status: 'published'
            });
            
            return `Content appended to ${filename} in ${targetGroupCode}`;
          }

          case 'search': {
            if (!query) throw new Error('query is required for search');
            // Regex to match agent prefix and any subfolders
            const agentPrefixRegex = new RegExp(`^${agentPrefix}(?:$|__)`);
            
            const docs = await Markdown.find({
              category: CATEGORY,
              group_code: { $regex: agentPrefixRegex },
              $or: [
                { title: { $regex: query, $options: 'i' } },
                { markdownRaw: { $regex: query, $options: 'i' } }
              ]
            }).select('slug group_code title').limit(20).lean();
            
            return JSON.stringify(docs.map(d => ({
              filename: d.slug + '.md',
              subfolder: d.group_code.replace(agentPrefix, '').replace(/^__/, '') || 'root',
              title: d.title
            })), null, 2);
          }

          default:
            throw new Error(`Unknown memory operation: ${operation}`);
        }
      } catch (err) {
        return createErrorResponse(err, {
          code: ERROR_CODES.INTERNAL_ERROR,
          type: 'memory_operation_failed',
          recoverable: true
        });
      }
    }
  },
  exec: {
    description: 'Execute a shell command in the project working directory. Use this for system operations, checking logs, or running scripts.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute'
        }
      },
      required: ['command']
    },
    execute: async ({ command }) => {
      try {
        const { stdout, stderr } = await execAsync(command);
        return JSON.stringify({
          stdout: stdout.trim(),
          stderr: stderr.trim()
        }, null, 2);
      } catch (err) {
        const suggestions = [];
        if (err.stderr && err.stderr.includes('command not found')) {
          suggestions.push('Check if the command is installed and available in PATH');
        }
        if (err.stderr && err.stderr.includes('not found')) {
          suggestions.push('Check the command name is spelled correctly');
        }
        if (err.code === 'ENOENT') {
          suggestions.push('Check the working directory exists and is accessible');
        }
        return createErrorResponse(err, {
          code: ERROR_CODES.INTERNAL_ERROR,
          type: 'shell_execution_failed',
          recoverable: true,
          suggestions
        });
      }
    }
  },
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
        const suggestions = [];
        if (err.message.includes('not found')) {
          suggestions.push('Check the model name is spelled correctly');
          suggestions.push('Use raw_db_query to list available models');
        }
        if (err.name === 'MongooseError') {
          suggestions.push('Check database connection is active');
        }
        if (err.message.includes('not found') || err.message.includes('Schema')) {
          suggestions.push('Check the model name is spelled correctly');
          suggestions.push('Use raw_db_query to list available models');
        }
        if (err.name === 'MongooseError') {
          suggestions.push('Check database connection is active');
        }
        return createErrorResponse(err, {
          code: ERROR_CODES.NOT_FOUND,
          type: 'database_query_failed',
          recoverable: true,
          suggestions
        });
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
        const suggestions = [];
        if (err.name === 'MongooseError') {
          suggestions.push('Check database connection is active');
          suggestions.push('Ensure MongoDB server is running');
        }
        return createErrorResponse(err, {
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          type: 'database_stats_failed',
          recoverable: true,
          suggestions
        });
      }
    }
  },
  raw_db_query: {
    description: 'Execute raw MongoDB queries for database exploration. Use this to discover collection names, databases, or run admin commands.',
    parameters: {
      type: 'object',
      properties: {
        queryType: {
          type: 'string',
          enum: ['listDatabases', 'listCollections', 'countDocuments', 'findOne', 'aggregate', 'adminCommand'],
          description: 'The type of raw query to execute'
        },
        database: {
          type: 'string',
          description: 'Database name (optional, defaults to current database)'
        },
        collection: {
          type: 'string',
          description: 'Collection name (required for collection-specific queries)'
        },
        filter: {
          oneOf: [
            { type: 'object', description: 'MongoDB filter/query object as JSON object' },
            { type: 'string', description: 'MongoDB filter/query object as JSON string (will be parsed)' }
          ],
          description: 'MongoDB filter/query object (for countDocuments, findOne, aggregate). Can be object or JSON string.'
        },
        limit: {
          type: 'number',
          description: 'Limit the number of results (for listCollections, findOne, aggregate)',
          default: 10
        },
        adminCommand: {
          oneOf: [
            { type: 'object', description: 'Admin command as JSON object' },
            { type: 'string', description: 'Admin command as JSON string (will be parsed)' }
          ],
          description: 'Admin command to execute (for adminCommand queryType)'
        }
      },
      required: ['queryType']
    },
    execute: async ({ queryType, database, collection, filter = {}, limit = 10, adminCommand }) => {
      try {
        if (!mongoose.connection || !mongoose.connection.db) {
          throw new Error('MongoDB connection not ready. Please ensure database is connected.');
        }

        let db = mongoose.connection.db;
        
        if (database && database !== mongoose.connection.name) {
          db = mongoose.connection.useDb(database);
        }

        let parsedFilter = filter;
        if (typeof filter === 'string') {
          try {
            parsedFilter = JSON.parse(filter);
          } catch (err) {
            throw new Error(`Failed to parse filter JSON: ${err.message}`);
          }
        }

        let parsedAdminCommand = adminCommand;
        if (typeof adminCommand === 'string') {
          try {
            parsedAdminCommand = JSON.parse(adminCommand);
          } catch (err) {
            throw new Error(`Failed to parse adminCommand JSON: ${err.message}`);
          }
        }

        switch (queryType) {
          case 'listDatabases': {
            try {
              const result = await mongoose.connection.db.admin().listDatabases();
              const databases = (result?.databases || []).map(d => d.name).filter(Boolean).sort();
              return JSON.stringify({ databases }, null, 2);
            } catch (err) {
              return createErrorResponse(err, {
                code: ERROR_CODES.PERMISSION_DENIED,
                type: 'admin_access_required',
                recoverable: false,
                suggestions: [
                  'Try queryType: "listCollections" with database parameter',
                  'Check if your database user has admin privileges'
                ]
              });
            }
          }

          case 'listCollections': {
            if (!database && !mongoose.connection.name) {
              throw new Error('Database name required for listCollections');
            }
            const targetDb = database ? db : mongoose.connection.db;
            const cursor = await targetDb.listCollections({}, { nameOnly: true });
            const collections = await cursor.toArray();
            const names = collections.map(c => c.name).filter(Boolean).sort();
            return JSON.stringify({ 
              database: database || mongoose.connection.name,
              collections: names 
            }, null, 2);
          }

          case 'countDocuments': {
            if (!collection) throw new Error('Collection name required for countDocuments');
            const coll = db.collection(collection);
            const count = await coll.countDocuments(parsedFilter);
            return JSON.stringify({ 
              collection,
              database: database || mongoose.connection.name,
              count,
              filter: parsedFilter
            }, null, 2);
          }

          case 'findOne': {
            if (!collection) throw new Error('Collection name required for findOne');
            const coll = db.collection(collection);
            const result = await coll.findOne(parsedFilter);
            return JSON.stringify({ 
              collection,
              database: database || mongoose.connection.name,
              found: !!result,
              result: result || null
            }, null, 2);
          }

          case 'aggregate': {
            if (!collection) throw new Error('Collection name required for aggregate');
            const coll = db.collection(collection);
            const pipeline = Array.isArray(parsedFilter) ? parsedFilter : [parsedFilter];
            const results = await coll.aggregate(pipeline).limit(limit).toArray();
            return JSON.stringify({ 
              collection,
              database: database || mongoose.connection.name,
              results,
              count: results.length
            }, null, 2);
          }

          case 'adminCommand': {
            if (!parsedAdminCommand) throw new Error('Admin command required for adminCommand queryType');
            const result = await mongoose.connection.db.admin().command(parsedAdminCommand);
            return JSON.stringify({ 
              adminCommand: parsedAdminCommand,
              result
            }, null, 2);
          }

          default:
            throw new Error(`Unknown queryType: ${queryType}. Supported: listDatabases, listCollections, countDocuments, findOne, aggregate, adminCommand`);
        }
      } catch (err) {
        const suggestions = [];
        if (err.message.includes('connection not ready')) {
          suggestions.push('Check database connection is active');
          suggestions.push('Ensure MongoDB server is running');
        }
        if (err.message.includes('JSON')) {
          suggestions.push('Check your filter/adminCommand is valid JSON');
          suggestions.push('Use a JSON validator if unsure');
        }
        if (err.message.includes('required')) {
          suggestions.push('Check the required parameters are provided');
          suggestions.push('Review the tool documentation for parameter requirements');
        }
        return createErrorResponse(err, {
          code: ERROR_CODES.INVALID_INPUT,
          type: 'query_execution_failed',
          recoverable: true,
          suggestions
        });
      }
    }
  }
};

async function executeTool(name, args, context = {}) {
  const tool = tools[name];
  if (!tool) {
    return createErrorResponse(new Error(`Tool ${name} not found`), {
      code: ERROR_CODES.NOT_FOUND,
      type: 'tool_not_found',
      recoverable: false,
      suggestions: [
        'Check the tool name is spelled correctly',
        'List available tools using the system prompt'
      ]
    });
  }
  console.log(`Executing tool ${name} with args:`, args);
  return await tool.execute(args, context);
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
