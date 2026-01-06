/**
 * Represents a single document instance in SQLite
 */
class Document {
  constructor(data, model) {
    this._model = model;
    this._data = data || {};
    this._original = JSON.parse(JSON.stringify(this._data));
    this._modified = false;
  }

  // Expose data properties directly for easier access
  get email() { return this._data.email; }
  get name() { return this._data.name; }
  get age() { return this._data.age; }
  get id() { return this._data.id; }
  get role() { return this._data.role; }
  get title() { return this._data.title; }
  get content() { return this._data.content; }
  get published() { return this._data.published; }
  get status() { return this._data.status; }
  get createdAt() { return this._data.createdAt; }
  get updatedAt() { return this._data.updatedAt; }

  get(field) {
    return this._data[field];
  }

  set(field, value) {
    if (this._data[field] !== value) {
      this._modified = true;
    }
    this._data[field] = value;
    return this;
  }

  toObject() {
    return JSON.parse(JSON.stringify(this._data));
  }

  toJSON() {
    return this.toObject();
  }

  isModified(field) {
    if (!field) {
      return this._modified;
    }
    return this._original[field] !== this._data[field];
  }

  async save() {
    if (!this._model) {
      throw new Error('Model not set on document');
    }

    // Run pre-save hooks
    if (this._model.schema._hooks && this._model.schema._hooks['save']) {
      for (const hook of this._model.schema._hooks['save']) {
        await hook.call(this);
      }
    }

    const db = this._model.db;
    const tableName = this._model.tableName;
    const schema = this._model.schema;

    // Prepare data with defaults
    const dataToSave = { ...this._data };

    if (!dataToSave.id) {
      dataToSave.id = this._generateId();
      this._data.id = dataToSave.id;
    }

    if (schema.timestamps && !dataToSave.createdAt) {
      dataToSave.createdAt = new Date().toISOString();
      this._data.createdAt = dataToSave.createdAt;
    }

    if (schema.timestamps) {
      dataToSave.updatedAt = new Date().toISOString();
      this._data.updatedAt = dataToSave.updatedAt;
    }

    // Check if insert or update
    const exists = db.prepare(`SELECT 1 FROM ${tableName} WHERE id = ?`).get(dataToSave.id);

    if (exists) {
      // Update
      const updateKeys = Object.keys(dataToSave).filter(k => k !== 'id');
      const setClause = updateKeys.map(k => `${k} = ?`).join(', ');
      const values = updateKeys.map(k => this._serializeValue(dataToSave[k]));
      
      const stmt = db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`);
      stmt.run(...values, dataToSave.id);
    } else {
      // Insert
      const keys = Object.keys(dataToSave);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => this._serializeValue(dataToSave[k]));
      
      const stmt = db.prepare(
        `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`
      );
      stmt.run(...values);
    }

    this._modified = false;
    this._original = JSON.parse(JSON.stringify(this._data));
    return this;
  }

  async deleteOne() {
    if (!this._model || !this._data.id) {
      throw new Error('Cannot delete document without model or id');
    }

    const db = this._model.db;
    const tableName = this._model.tableName;

    const stmt = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`);
    stmt.run(this._data.id);

    return this;
  }

  _generateId() {
    // Generate a 16-character hex string like MongoDB
    return Array.from({ length: 16 })
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
  }

  _serializeValue(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    return value;
  }
}

module.exports = Document;
