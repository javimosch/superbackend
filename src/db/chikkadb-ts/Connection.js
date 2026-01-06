const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let dbInstance = null;
let sqlDb = null;

class Connection {
  static async init(options = {}) {
    if (dbInstance) {
      return dbInstance;
    }

    const SQL = await initSqlJs();
    const dataDir = options.dataDir || './data';
    const dbPath = options.dbPath || path.join(dataDir, 'saasbackend.db');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load existing db or create new
    if (fs.existsSync(dbPath)) {
      const filebuffer = fs.readFileSync(dbPath);
      sqlDb = new SQL.Database(filebuffer);
    } else {
      sqlDb = new SQL.Database();
    }

    dbInstance = new SQLiteAdapter(sqlDb, dbPath);
    return dbInstance;
  }

  static getInstance() {
    if (!dbInstance) {
      throw new Error('Connection not initialized. Call Connection.init() first.');
    }
    return dbInstance;
  }

  static close() {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
      sqlDb = null;
    }
  }
}

class SQLiteAdapter {
  constructor(sqlDb, dbPath) {
    this.sqlDb = sqlDb;
    this.dbPath = dbPath;
  }

  prepare(sql) {
    const sqlDb = this.sqlDb;
    const dbPath = this.dbPath;

    return {
      run: (...params) => {
        try {
          sqlDb.run(sql, params);
          this._save();
          return { changes: sqlDb.getRowsModified() };
        } catch (err) {
          throw new Error(`SQLite Error: ${err.message}`);
        }
      },
      get: (...params) => {
        try {
          const stmt = sqlDb.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return null;
        } catch (err) {
          throw new Error(`SQLite Error: ${err.message}`);
        }
      },
      all: (...params) => {
        try {
          const stmt = sqlDb.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.free();
          return rows;
        } catch (err) {
          throw new Error(`SQLite Error: ${err.message}`);
        }
      }
    };
  }

  exec(sql) {
    try {
      this.sqlDb.run(sql);
      this._save();
    } catch (err) {
      throw new Error(`SQLite Error: ${err.message}`);
    }
  }

  pragma(pragma) {
    // sql.js doesn't support pragmas, but foreign keys are enabled by default
    return true;
  }

  _save() {
    const data = this.sqlDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  close() {
    if (this.sqlDb) {
      this.sqlDb.close();
    }
  }
}

module.exports = Connection;

