/**
 * Translates Mongoose schema definitions to SQLite-compatible format
 */
class Schema {
  constructor(definition, options = {}) {
    this.definition = definition;
    this.options = options;
    this.fields = {};
    this.indexes = [];
    this.timestamps = options.timestamps !== false;
    
    this._parseDefinition();
  }

  _parseDefinition() {
    Object.entries(this.definition).forEach(([fieldName, fieldConfig]) => {
      const sqliteType = this._getSQLiteType(fieldConfig);
      const constraints = this._getConstraints(fieldName, fieldConfig);
      
      this.fields[fieldName] = {
        name: fieldName,
        sqliteType,
        constraints,
        config: fieldConfig
      };

      // Track indexes
      if (fieldConfig.index) {
        this.indexes.push({
          field: fieldName,
          unique: fieldConfig.unique
        });
      }
    });
  }

  _getSQLiteType(fieldConfig) {
    const type = fieldConfig.type || fieldConfig;
    
    if (type === String) return 'TEXT';
    if (type === Number) return 'REAL';
    if (type === Boolean) return 'INTEGER'; // SQLite uses 0/1
    if (type === Date) return 'TEXT'; // ISO string
    if (type.name === 'ObjectId') return 'TEXT';
    
    // Handle mongoose.Schema.Types.Mixed or nested objects
    if (fieldConfig.type?.name === 'Mixed' || type === Object || type.name === 'Mixed') {
      return 'TEXT'; // Store as JSON
    }
    
    return 'TEXT'; // Default fallback
  }

  _getConstraints(fieldName, fieldConfig) {
    const constraints = [];
    
    if (fieldConfig.required || (typeof fieldConfig.required === 'function' && fieldConfig.required())) {
      constraints.push('NOT NULL');
    }
    
    if (fieldConfig.unique) {
      constraints.push('UNIQUE');
    }
    
    if (fieldConfig.default !== undefined && typeof fieldConfig.default !== 'function') {
      // Will be handled in insert/update logic
    }
    
    return constraints.join(' ');
  }

  methods(name, func) {
    // Store methods for later use on document instances
    if (!this._methods) {
      this._methods = {};
    }
    this._methods[name] = func;
    return this;
  }

  pre(hook, func) {
    // Store hooks
    if (!this._hooks) {
      this._hooks = {};
    }
    if (!this._hooks[hook]) {
      this._hooks[hook] = [];
    }
    this._hooks[hook].push(func);
    return this;
  }

  statics(name, func) {
    if (!this._statics) {
      this._statics = {};
    }
    this._statics[name] = func;
    return this;
  }

  getCreateTableSQL(tableName) {
    const columns = ['id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))'];
    
    Object.entries(this.fields).forEach(([fieldName, field]) => {
      const constraint = field.constraints ? ' ' + field.constraints : '';
      columns.push(`${fieldName} ${field.sqliteType}${constraint}`);
    });

    if (this.timestamps) {
      columns.push('createdAt TEXT DEFAULT (datetime(\'now\'))');
      columns.push('updatedAt TEXT DEFAULT (datetime(\'now\'))');
    }

    columns.push('__v INTEGER DEFAULT 0');

    return `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(', ')})`;
  }

  getIndexSQL(tableName, indexName) {
    return this.indexes.map(idx => {
      const unique = idx.unique ? 'UNIQUE' : '';
      return `CREATE ${unique} INDEX IF NOT EXISTS idx_${tableName}_${idx.field} ON ${tableName}(${idx.field})`;
    }).join(';');
  }
}

module.exports = Schema;
