const Connection = require('./Connection');
const Schema = require('./Schema');
const Model = require('./Model');
const Document = require('./Document');
const Query = require('./Query');

/**
 * ChikkaDB-TS: Mongoose-compatible SQLite adapter
 * Provides a translation layer to use SQLite as a drop-in replacement for MongoDB
 */
class ChikkaDB {
  static async init(options = {}) {
    const db = await Connection.init(options);
    return new ChikkaDB(db);
  }

  constructor(db) {
    this.db = db;
    this.models = {};
    this.Schema = Schema;
  }

  model(name, schema, collection) {
    const tableName = collection || name.toLowerCase();

    if (this.models[name]) {
      return this.models[name];
    }

    const model = new Model(tableName, schema, this.db);
    this.models[name] = model;

    return model;
  }

  connection() {
    return {
      db: this.db,
      readyState: 1, // Connected
    };
  }

  async disconnect() {
    Connection.close();
  }

  async close() {
    return this.disconnect();
  }
}

module.exports = {
  ChikkaDB,
  Connection,
  Schema,
  Model,
  Document,
  Query,
  init: ChikkaDB.init,
};
