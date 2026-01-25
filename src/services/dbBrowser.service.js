const mongoose = require('mongoose');

const ExternalDbConnection = require('../models/ExternalDbConnection');
const { encryptString, decryptString } = require('../utils/encryption');

// Cache adapters by connection id to avoid reconnecting on every request
const adapterCache = new Map();

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'FORBIDDEN') return { status: 403, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function normalizeName(name) {
  const v = String(name || '').trim();
  if (!v) throw Object.assign(new Error('name is required'), { code: 'VALIDATION' });
  if (v.length > 120) throw Object.assign(new Error('name is too long'), { code: 'VALIDATION' });
  return v;
}

function normalizeType(type) {
  const v = String(type || '').trim().toLowerCase();
  if (!['mongo', 'mysql'].includes(v)) {
    throw Object.assign(new Error('type must be mongo or mysql'), { code: 'VALIDATION' });
  }
  return v;
}

function normalizeUri(uri) {
  const v = String(uri || '').trim();
  if (!v) throw Object.assign(new Error('uri is required'), { code: 'VALIDATION' });
  if (v.length > 2000) throw Object.assign(new Error('uri is too long'), { code: 'VALIDATION' });
  return v;
}

function maskUri(uri) {
  const raw = String(uri || '').trim();
  if (!raw) return null;

  // Mask user:pass for URIs like protocol://user:pass@host/... or protocol://user@host/...
  // Keep protocol/host/query visible for debugging.
  try {
    const u = new URL(raw);
    const hasCreds = Boolean(u.username || u.password);
    if (hasCreds) {
      u.username = u.username ? '***' : '';
      u.password = u.password ? '***' : '';
    }
    return u.toString();
  } catch {
    // Fallback: regex mask the authority section.
    return raw.replace(/:\/\/[^@/]+@/g, '://***@');
  }
}

function sanitizeConnectionDoc(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.name,
    type: doc.type,
    enabled: Boolean(doc.enabled),
    uriMasked: doc.uriMasked || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function parseIntBounded(v, { min = 1, max = 100 } = {}) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeIdentifier(v, { label = 'identifier' } = {}) {
  const s = String(v || '').trim();
  if (!s) throw Object.assign(new Error(`${label} is required`), { code: 'VALIDATION' });
  // Conservative: allow alphanumerics, underscore and dash.
  if (!/^[A-Za-z0-9_\-]+$/.test(s)) {
    throw Object.assign(new Error(`Invalid ${label}`), { code: 'VALIDATION' });
  }
  return s;
}

function normalizeMongoField(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  // allow dot paths, prevent $ operators
  if (s.includes('$')) {
    throw Object.assign(new Error('Invalid field'), { code: 'VALIDATION' });
  }
  if (!/^[A-Za-z0-9_\.\-]+$/.test(s)) {
    throw Object.assign(new Error('Invalid field'), { code: 'VALIDATION' });
  }
  return s;
}

function normalizeMongoNamespace(v, { label = 'collection', maxLen = 255 } = {}) {
  const s = String(v || '').trim();
  if (!s) throw Object.assign(new Error(`${label} is required`), { code: 'VALIDATION' });
  if (s.length > maxLen) throw Object.assign(new Error(`${label} is too long`), { code: 'VALIDATION' });
  // Disallow null bytes and operator-ish names
  if (s.includes('\u0000') || s.includes('\0') || s.includes('\x00') || s.includes(String.fromCharCode(0)) || s.includes('$')) {
    throw Object.assign(new Error(`Invalid ${label}`), { code: 'VALIDATION' });
  }
  // Allow common collection characters, including dots.
  if (!/^[A-Za-z0-9_\.\-]+$/.test(s)) {
    throw Object.assign(new Error(`Invalid ${label}`), { code: 'VALIDATION' });
  }
  return s;
}

function escapeMongoRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getEnabledConnection(connectionId) {
  const doc = await ExternalDbConnection.findById(connectionId);
  if (!doc) throw Object.assign(new Error('Connection not found'), { code: 'NOT_FOUND' });
  if (!doc.enabled) throw Object.assign(new Error('Connection is disabled'), { code: 'FORBIDDEN' });
  return doc;
}

async function getAdapter(connectionId) {
  const doc = await getEnabledConnection(connectionId);
  const updatedAtMs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0;

  const cached = adapterCache.get(String(doc._id));
  if (cached && cached.updatedAtMs === updatedAtMs && cached.type === doc.type) {
    return cached.adapter;
  }

  if (cached?.adapter?.close) {
    try {
      await cached.adapter.close();
    } catch {
      // ignore
    }
  }

  const uri = decryptString(doc.uriEncrypted);
  const adapter = doc.type === 'mongo' ? await createMongoAdapter(uri) : await createMysqlAdapter(uri);
  adapterCache.set(String(doc._id), { adapter, type: doc.type, updatedAtMs });
  return adapter;
}

async function createMongoAdapter(uri) {
  const conn = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 5,
  });
  await conn.asPromise();

  async function useDb(database) {
    const dbName = normalizeIdentifier(database, { label: 'database' });
    const dbConn = conn.useDb(dbName, { useCache: true });
    await dbConn.asPromise().catch(() => {});
    return dbConn;
  }

  return {
    type: 'mongo',
    async close() {
      await conn.close();
    },
    async testConnection() {
      await conn.db.admin().ping();
      return { ok: true };
    },
    async listDatabases() {
      const out = await conn.db.admin().listDatabases();
      const names = (out?.databases || []).map((d) => d.name).filter(Boolean).sort();
      return names;
    },
    async listNamespaces({ database }) {
      const dbConn = await useDb(database);
      const cols = await dbConn.db.listCollections({}, { nameOnly: true }).toArray();
      return cols.map((c) => c.name).filter(Boolean).sort();
    },
    async getSchema() {
      // Mongo doesn't have a rigid schema; v1 returns null.
      return null;
    },
    async listRecords({ database, namespace, page = 1, pageSize = 20, filterField, filterValue, sortField, sortOrder }) {
      const dbConn = await useDb(database);
      const collection = normalizeMongoNamespace(namespace, { label: 'collection' });

      const safePage = parseIntBounded(page, { min: 1, max: 1000000 });
      const safePageSize = parseIntBounded(pageSize, { min: 1, max: 100 });
      const skip = (safePage - 1) * safePageSize;

      const query = {};
      const f = normalizeMongoField(filterField);
      const fv = String(filterValue || '').trim();
      if (f && fv) {
        if (f === '_id' && mongoose.isValidObjectId(fv)) {
          query._id = new mongoose.Types.ObjectId(fv);
        } else {
          query[f] = { $regex: escapeMongoRegexLiteral(fv), $options: 'i' };
        }
      }

      const sort = {};
      const sField = normalizeMongoField(sortField);
      if (sField) {
        sort[sField] = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
      }

      const col = dbConn.db.collection(collection);
      const [items, total] = await Promise.all([
        col
          .find(query)
          .sort(Object.keys(sort).length ? sort : undefined)
          .skip(skip)
          .limit(safePageSize)
          .toArray(),
        col.countDocuments(query),
      ]);

      return {
        items,
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.ceil(total / safePageSize),
      };
    },
    async getRecord({ database, namespace, id }) {
      const dbConn = await useDb(database);
      const collection = normalizeMongoNamespace(namespace, { label: 'collection' });
      const rawId = String(id || '').trim();
      if (!rawId) throw Object.assign(new Error('id is required'), { code: 'VALIDATION' });

      const query = mongoose.isValidObjectId(rawId)
        ? { _id: new mongoose.Types.ObjectId(rawId) }
        : { _id: rawId };

      const item = await dbConn.db.collection(collection).findOne(query);
      if (!item) throw Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
      return item;
    },
  };
}

async function createMysqlAdapter(uri) {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    throw Object.assign(
      new Error('MySQL browsing requires the "mysql2" package. Please add it to dependencies.'),
      { code: 'VALIDATION' },
    );
  }

  const pool = mysql.createPool(uri);

  function normalizeSqlIdentifier(v, { label = 'identifier', maxLen = 128 } = {}) {
    const s = String(v || '');
    const trimmed = s.trim();
    if (!trimmed) throw Object.assign(new Error(`${label} is required`), { code: 'VALIDATION' });
    if (trimmed.length > maxLen) {
      throw Object.assign(new Error(`${label} is too long`), { code: 'VALIDATION' });
    }
    if (trimmed.includes('\u0000') || trimmed.includes('\0') || trimmed.includes('\x00') || trimmed.includes(String.fromCharCode(0))) {
      throw Object.assign(new Error(`Invalid ${label}`), { code: 'VALIDATION' });
    }
    return trimmed;
  }

  function escapeId(id) {
    // MySQL identifier quoting: wrap in backticks and escape internal backticks by doubling them.
    const safe = normalizeSqlIdentifier(id);
    return `\`${safe.replace(/`/g, '``')}\``;
  }

	  function normalizeSqlValue(v, { label = 'value', maxLen = 2000 } = {}) {
	    const s = String(v || '').trim();
	    if (!s) throw Object.assign(new Error(`${label} is required`), { code: 'VALIDATION' });
	    if (s.length > maxLen) throw Object.assign(new Error(`${label} is too long`), { code: 'VALIDATION' });
	    if (s.includes('\u0000') || s.includes('\0') || s.includes('\x00') || s.includes(String.fromCharCode(0))) {
	      throw Object.assign(new Error(`Invalid ${label}`), { code: 'VALIDATION' });
	    }
	    return s;
	  }

  return {
    type: 'mysql',
    async close() {
      await pool.end();
    },
    async testConnection() {
      const conn = await pool.getConnection();
      try {
        await conn.ping();
      } finally {
        conn.release();
      }
      return { ok: true };
    },
    async listDatabases() {
      const [rows] = await pool.query('SHOW DATABASES');
      const names = (rows || [])
        .map((r) => r.Database)
        .filter(Boolean)
        .sort();
      return names;
    },
    async listNamespaces({ database }) {
      const db = normalizeSqlIdentifier(database, { label: 'database' });
      const [rows] = await pool.query(`SHOW TABLES FROM ${escapeId(db)}`);
      const names = (rows || [])
        .map((r) => r[Object.keys(r)[0]])
        .filter(Boolean)
        .sort();
      return names;
    },
    async getSchema({ database, namespace }) {
      const db = normalizeSqlIdentifier(database, { label: 'database' });
      const table = normalizeSqlIdentifier(namespace, { label: 'table' });
      const [rows] = await pool.query(
        `SHOW COLUMNS FROM ${escapeId(db)}.${escapeId(table)}`,
      );
      return (rows || []).map((r) => ({
        field: r.Field,
        type: r.Type,
        nullable: r.Null,
        key: r.Key,
        default: r.Default,
        extra: r.Extra,
      }));
    },
    async listRecords({ database, namespace, page = 1, pageSize = 20, filterField, filterValue, sortField, sortOrder }) {
      const db = normalizeSqlIdentifier(database, { label: 'database' });
      const table = normalizeSqlIdentifier(namespace, { label: 'table' });

      const safePage = parseIntBounded(page, { min: 1, max: 1000000 });
      const safePageSize = parseIntBounded(pageSize, { min: 1, max: 100 });
      const offset = (safePage - 1) * safePageSize;

      const schema = await this.getSchema({ database: db, namespace: table });
      const columns = new Set(schema.map((c) => c.field).filter(Boolean));

      const where = [];
      const params = [];

      const f = String(filterField || '').trim();
      const fv = String(filterValue || '').trim();
      if (f && fv) {
        if (!columns.has(f)) {
          throw Object.assign(new Error('Invalid filter field'), { code: 'VALIDATION' });
        }
        // `f` is validated against actual columns, then safely quoted.
        where.push(`${escapeId(f)} LIKE ?`);
        params.push(`%${fv}%`);
      }

      const s = String(sortField || '').trim();
      let orderBy = '';
      if (s) {
        if (!columns.has(s)) {
          throw Object.assign(new Error('Invalid sort field'), { code: 'VALIDATION' });
        }
        orderBy = ` ORDER BY ${escapeId(s)} ${String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC'}`;
      }

      const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const fromSql = `${escapeId(db)}.${escapeId(table)}`;

      const [itemsRows, countRows] = await Promise.all([
        pool
          .query(
            `SELECT * FROM ${fromSql}${whereSql}${orderBy} LIMIT ? OFFSET ?`,
            [...params, safePageSize, offset],
          )
          .then((r) => r[0]),
        pool
          .query(
            `SELECT COUNT(*) AS cnt FROM ${fromSql}${whereSql}`,
            params,
          )
          .then((r) => r[0]),
      ]);

      const total = Number(countRows?.[0]?.cnt || 0);
      return {
        items: itemsRows || [],
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.ceil(total / safePageSize),
      };
    },
	    async getRecord({ database, namespace, id }) {
	      const db = normalizeSqlIdentifier(database, { label: 'database' });
	      const table = normalizeSqlIdentifier(namespace, { label: 'table' });
	      const recordId = normalizeSqlValue(id, { label: 'recordId' });

	      const schema = await this.getSchema({ database: db, namespace: table });
	      const pkCols = (schema || []).filter((c) => String(c?.key || '').toUpperCase() === 'PRI').map((c) => c.field).filter(Boolean);
	      const columns = new Set((schema || []).map((c) => c.field).filter(Boolean));

	      let pk = null;
	      if (pkCols.length === 1) {
	        pk = pkCols[0];
	      } else if (pkCols.length === 0 && columns.has('id')) {
	        // Fallback: common convention
	        pk = 'id';
	      }
	      if (!pk) {
	        throw Object.assign(new Error('Could not determine a single primary key column for this table'), { code: 'VALIDATION' });
	      }

	      const fromSql = `${escapeId(db)}.${escapeId(table)}`;
	      const [rows] = await pool.query(
	        `SELECT * FROM ${fromSql} WHERE ${escapeId(pk)} = ? LIMIT 1`,
	        [recordId],
	      );
	      const item = rows?.[0] || null;
	      if (!item) throw Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
	      return item;
	    },
  };
}

// CRUD: connection profiles
async function listConnections() {
  const docs = await ExternalDbConnection.find({}).sort({ createdAt: -1 }).lean();
  return docs.map(sanitizeConnectionDoc);
}

async function getConnection(connectionId) {
  const doc = await ExternalDbConnection.findById(connectionId);
  if (!doc) throw Object.assign(new Error('Connection not found'), { code: 'NOT_FOUND' });
  return sanitizeConnectionDoc(doc);
}

async function createConnection(payload = {}) {
  const name = normalizeName(payload.name);
  const type = normalizeType(payload.type);
  const uri = normalizeUri(payload.uri);
  const enabled = payload.enabled === undefined ? true : Boolean(payload.enabled);

  const doc = await ExternalDbConnection.create({
    name,
    type,
    enabled,
    uriMasked: maskUri(uri),
    uriEncrypted: encryptString(uri),
  });
  return sanitizeConnectionDoc(doc);
}

async function updateConnection(connectionId, payload = {}) {
  const doc = await ExternalDbConnection.findById(connectionId);
  if (!doc) throw Object.assign(new Error('Connection not found'), { code: 'NOT_FOUND' });

  if (payload.name !== undefined) doc.name = normalizeName(payload.name);
  if (payload.type !== undefined) doc.type = normalizeType(payload.type);
  if (payload.enabled !== undefined) doc.enabled = Boolean(payload.enabled);

  if (payload.uri !== undefined) {
    const uri = normalizeUri(payload.uri);
    doc.uriMasked = maskUri(uri);
    doc.uriEncrypted = encryptString(uri);
  }

  await doc.save();
  return sanitizeConnectionDoc(doc);
}

async function deleteConnection(connectionId) {
  const doc = await ExternalDbConnection.findByIdAndDelete(connectionId);
  if (!doc) throw Object.assign(new Error('Connection not found'), { code: 'NOT_FOUND' });

  const cached = adapterCache.get(String(connectionId));
  if (cached?.adapter?.close) {
    try {
      await cached.adapter.close();
    } catch {
      // ignore
    }
  }
  adapterCache.delete(String(connectionId));
  return { ok: true };
}

async function testConnection(connectionId) {
  const adapter = await getAdapter(connectionId);
  return adapter.testConnection();
}

// Browsing
async function listDatabases(connectionId) {
  const adapter = await getAdapter(connectionId);
  return adapter.listDatabases();
}

async function listNamespaces(connectionId, database) {
  const adapter = await getAdapter(connectionId);
  return adapter.listNamespaces({ database });
}

async function getSchema(connectionId, database, namespace) {
  const adapter = await getAdapter(connectionId);
  return adapter.getSchema({ database, namespace });
}

async function listRecords(connectionId, database, namespace, options = {}) {
  const adapter = await getAdapter(connectionId);
  return adapter.listRecords({ database, namespace, ...options });
}

async function getRecord(connectionId, database, namespace, id) {
  const adapter = await getAdapter(connectionId);
  return adapter.getRecord({ database, namespace, id });
}

module.exports = {
  toSafeJsonError,
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  listDatabases,
  listNamespaces,
  getSchema,
  listRecords,
  getRecord,
};
