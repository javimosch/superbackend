/**
 * Mongoose Adapter for SQLite fallback
 * Overrides mongoose.model() to use ChikkaDB when MongoDB URI is not available
 */

const mongoose = require('mongoose');
const { ChikkaDB, Schema: ChikkaSchema } = require('./chikkadb-ts');

let chikkadb = null;
let isSQLiteMode = false;
let initPromise = null;

/**
 * Initialize the adapter
 * @param {boolean} useSQLite - Whether to use SQLite fallback
 * @param {Object} options - Configuration options for ChikkaDB
 */
async function initMongooseAdapter(useSQLite = false, options = {}) {
  isSQLiteMode = useSQLite;

  if (useSQLite && !chikkadb) {
    if (!initPromise) {
      initPromise = ChikkaDB.init(options).then(instance => {
        chikkadb = instance;
        console.log('✅ SQLite Mode: Using ChikkaDB as database adapter');

        // Override mongoose.model to use ChikkaDB
        const originalModel = mongoose.model.bind(mongoose);

        mongoose.model = function(name, schema, collection) {
          if (isSQLiteMode && chikkadb) {
            return createChikkaModel(name, schema, collection);
          }
          return originalModel(name, schema, collection);
        };

        // Make Schema compatible
        const originalSchema = mongoose.Schema;
        mongoose.Schema = function(definition, options) {
          if (isSQLiteMode) {
            return new ChikkaSchema(definition, options);
          }
          return new originalSchema(definition, options);
        };

        return chikkadb;
      });
    }
    return initPromise;
  } else if (!useSQLite) {
    console.log('✅ MongoDB Mode: Using Mongoose with MongoDB');
    return Promise.resolve();
  }
}

/**
 * Create a Mongoose-compatible model using ChikkaDB
 */
function createChikkaModel(name, schema, collection) {
  // Ensure schema is a ChikkaDB schema
  let chikkaSchema = schema;

  if (schema && schema.constructor.name === 'Schema' && !schema.getCreateTableSQL) {
    // Convert Mongoose schema to ChikkaDB schema
    const definition = schema.obj;
    chikkaSchema = new ChikkaSchema(definition, schema.options);
    
    // Copy methods from mongoose schema
    if (schema.methods) {
      Object.entries(schema.methods).forEach(([name, method]) => {
        if (!chikkaSchema._methods) {
          chikkaSchema._methods = {};
        }
        chikkaSchema._methods[name] = method;
      });
    }

    // Copy hooks from mongoose schema
    if (schema._pres) {
      Object.entries(schema._pres).forEach(([hook, callbacks]) => {
        callbacks.forEach(cb => {
          chikkaSchema.pre(hook, cb[0]);
        });
      });
    }
  }

  // Create ChikkaDB model
  const model = chikkadb.model(name, chikkaSchema, collection);

  // Add mongoose compatibility methods
  if (schema && schema.methods) {
    Object.entries(schema.methods).forEach(([methodName, method]) => {
      const proto = Object.getPrototypeOf(model);
      proto[methodName] = method;
    });
  }

  return model;
}

/**
 * Check if MongoDB URI is provided in env
 */
function shouldUseSQLite() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  return !mongoUri;
}

/**
 * Get ChikkaDB instance
 */
function getChikkaDB() {
  return chikkadb;
}

/**
 * Check if running in SQLite mode
 */
function isSQLite() {
  return isSQLiteMode;
}

module.exports = {
  initMongooseAdapter,
  createChikkaModel,
  shouldUseSQLite,
  getChikkaDB,
  isSQLite,
};
