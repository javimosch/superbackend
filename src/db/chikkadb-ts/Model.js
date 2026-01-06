const Query = require('./Query');
const Document = require('./Document');

/**
 * Mongoose-compatible Model for SQLite
 */
class Model {
  constructor(tableName, schema, db) {
    this.tableName = tableName;
    this.schema = schema;
    this.db = db;
    this._staticMethods = schema._statics || {};
    
    // Apply static methods
    Object.entries(this._staticMethods).forEach(([name, method]) => {
      this[name] = method.bind(this);
    });

    // Create table if not exists
    this._createTable();
    this._createIndexes();
  }

  _createTable() {
    const sql = this.schema.getCreateTableSQL(this.tableName);
    try {
      this.db.exec(sql);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }
  }

  _createIndexes() {
    const sql = this.schema.getIndexSQL(this.tableName);
    if (sql) {
      sql.split(';').forEach(statement => {
        if (statement.trim()) {
          try {
            this.db.exec(statement.trim());
          } catch (err) {
            // Index might already exist
          }
        }
      });
    }
  }

  async find(query = {}) {
    const q = new Query(this.tableName, this);
    q.where(query);

    const { sql, params } = q.buildSelectSQL();
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map(row => {
      const doc = this._deserializeRow(row);
      return this._wrapDocument(doc);
    });
  }

  async findById(id) {
    const q = new Query(this.tableName, this);
    q.where({ id });

    const { sql, params } = q.buildSelectSQL();
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);

    if (!row) return null;

    const doc = this._deserializeRow(row);
    return this._wrapDocument(doc);
  }

  async findOne(query = {}) {
    const q = new Query(this.tableName, this);
    q.where(query);
    q.limit(1);

    const { sql, params } = q.buildSelectSQL();
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);

    if (!row) return null;

    const doc = this._deserializeRow(row);
    return this._wrapDocument(doc);
  }

  async create(data) {
    const doc = new Document(data, this);
    await doc.save();
    return doc;
  }

  async updateOne(filter, update) {
    const q = new Query(this.tableName, this);
    q.where(filter);
    q.set(update);

    const { sql, params } = q.buildUpdateSQL();
    const stmt = this.db.prepare(sql);
    stmt.run(...params);

    return { modifiedCount: 1 };
  }

  async updateMany(filter, update) {
    const q = new Query(this.tableName, this);
    q.where(filter);
    q.set(update);

    const { sql, params } = q.buildUpdateSQL();
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    return { modifiedCount: result.changes || 0 };
  }

  async deleteOne(filter) {
    const q = new Query(this.tableName, this);
    q.where(filter);

    const { sql, params } = q.buildDeleteSQL();
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    return { deletedCount: result.changes || 0 };
  }

  async deleteMany(filter = {}) {
    const q = new Query(this.tableName, this);
    q.where(filter);

    const { sql, params } = q.buildDeleteSQL();
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    return { deletedCount: result.changes || 0 };
  }

  async countDocuments(filter = {}) {
    const q = new Query(this.tableName, this);
    q.where(filter);

    const { sql, params } = q.buildCountSQL();
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params);

    return result.count || 0;
  }

  async findByIdAndUpdate(id, update, options = {}) {
    await this.updateOne({ id }, update);
    
    if (options.new) {
      return this.findById(id);
    }

    // Return old document
    const q = new Query(this.tableName, this);
    q.where({ id });
    const { sql, params } = q.buildSelectSQL();
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);

    if (!row) return null;
    const doc = this._deserializeRow(row);
    return this._wrapDocument(doc);
  }

  async findByIdAndDelete(id, options = {}) {
    const oldDoc = await this.findById(id);
    if (oldDoc) {
      await this.deleteOne({ id });
    }
    return oldDoc;
  }

  _deserializeRow(row) {
    const doc = { ...row };

    // Deserialize JSON fields and handle type conversions
    Object.entries(doc).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }

      const fieldConfig = this.schema.definition[key];
      if (!fieldConfig) return;

      // Handle JSON/object fields
      if (typeof value === 'string') {
        const fieldType = fieldConfig.type || fieldConfig;
        if (fieldType === Object || fieldType?.name === 'Mixed') {
          try {
            doc[key] = JSON.parse(value);
          } catch (e) {
            // Leave as string if JSON parse fails
          }
        }
      }

      // Convert boolean from 0/1
      if (typeof value === 'number' && [0, 1].includes(value)) {
        const fieldType = fieldConfig.type || fieldConfig;
        if (fieldType === Boolean) {
          doc[key] = value === 1;
        }
      }
    });

    return doc;
  }

  _wrapDocument(data) {
    return new Document(data, this);
  }

  static find(query = {}) {
    return this.prototype.constructor.prototype.find.call(this, query);
  }
}

module.exports = Model;
