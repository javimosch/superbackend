const mongoose = require('mongoose');

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'FORBIDDEN') return { status: 403, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function ensureDbConnection() {
  const db = mongoose.connection?.db;
  if (!db) {
    throw Object.assign(new Error('MongoDB connection is not ready'), { code: 'FORBIDDEN' });
  }
  return db;
}

function normalizeCollectionName(value) {
  const name = String(value || '').trim();
  if (!name) throw Object.assign(new Error('collection is required'), { code: 'VALIDATION' });
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw Object.assign(new Error('Invalid collection name'), { code: 'VALIDATION' });
  }
  return name;
}

function normalizeDateField(value, fallback = 'createdAt') {
  const field = String(value || fallback).trim();
  if (!field) throw Object.assign(new Error('dateField is required'), { code: 'VALIDATION' });
  if (field.includes('$')) {
    throw Object.assign(new Error('Invalid dateField'), { code: 'VALIDATION' });
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(field)) {
    throw Object.assign(new Error('Invalid dateField'), { code: 'VALIDATION' });
  }
  return field;
}

function normalizeOlderThanDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw Object.assign(new Error('olderThanDays must be a positive number'), { code: 'VALIDATION' });
  }
  if (n > 36500) {
    throw Object.assign(new Error('olderThanDays is too large'), { code: 'VALIDATION' });
  }
  return Math.floor(n);
}

function normalizeLimit(value, fallback = 5000) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw Object.assign(new Error('limit must be a positive number'), { code: 'VALIDATION' });
  }
  return Math.min(Math.floor(n), 50000);
}

async function getCollectionStatsByName(db, collection) {
  const command = await db.command({ collStats: collection });
  return {
    name: collection,
    ns: command?.ns || null,
    count: Number(command?.count || 0),
    sizeBytes: Number(command?.size || 0),
    storageSizeBytes: Number(command?.storageSize || 0),
    totalIndexSizeBytes: Number(command?.totalIndexSize || 0),
    avgObjSizeBytes: Number(command?.avgObjSize || 0),
  };
}

async function listCollectionStats() {
  const db = ensureDbConnection();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = (collections || []).map((c) => c.name).filter(Boolean).sort();

  const stats = [];
  for (const name of names) {
    try {
      // collStats can fail on internal collections depending on Mongo version/config.
      const s = await getCollectionStatsByName(db, name);
      stats.push(s);
    } catch {
      stats.push({
        name,
        ns: null,
        count: 0,
        sizeBytes: 0,
        storageSizeBytes: 0,
        totalIndexSizeBytes: 0,
        avgObjSizeBytes: 0,
        unavailable: true,
      });
    }
  }

  return stats;
}

async function getMongoGlobalStats() {
  const db = ensureDbConnection();
  const stats = await db.stats();
  return {
    db: stats?.db || null,
    collections: Number(stats?.collections || 0),
    views: Number(stats?.views || 0),
    objects: Number(stats?.objects || 0),
    dataSizeBytes: Number(stats?.dataSize || 0),
    storageSizeBytes: Number(stats?.storageSize || 0),
    indexes: Number(stats?.indexes || 0),
    indexSizeBytes: Number(stats?.indexSize || 0),
    totalSizeBytes: Number(stats?.totalSize || 0),
  };
}

async function getOverviewStats() {
  const [global, collections] = await Promise.all([
    getMongoGlobalStats(),
    listCollectionStats(),
  ]);

  return { global, collections };
}

async function ensureCollectionExists(db, collectionName) {
  const collections = await db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
  if (!collections || collections.length === 0) {
    throw Object.assign(new Error('Collection not found'), { code: 'NOT_FOUND' });
  }
}

function buildOlderThanQuery({ dateField, cutoff }) {
  return {
    [dateField]: {
      $type: 'date',
      $lt: cutoff,
    },
  };
}

function estimateReclaimableBytes({ candidateCount, collectionStats }) {
  const avg = Number(collectionStats?.avgObjSizeBytes || 0);
  if (avg > 0) return Math.round(candidateCount * avg);

  const sizeBytes = Number(collectionStats?.sizeBytes || 0);
  const count = Number(collectionStats?.count || 0);
  if (sizeBytes > 0 && count > 0) {
    return Math.round(candidateCount * (sizeBytes / count));
  }

  return 0;
}

async function dryRunCollectionCleanup({ collection, olderThanDays, dateField = 'createdAt' }) {
  const db = ensureDbConnection();
  const collectionName = normalizeCollectionName(collection);
  const safeDateField = normalizeDateField(dateField);
  const days = normalizeOlderThanDays(olderThanDays);

  await ensureCollectionExists(db, collectionName);

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const query = buildOlderThanQuery({ dateField: safeDateField, cutoff });
  const mongoCollection = db.collection(collectionName);

  const [candidateCount, collectionStats] = await Promise.all([
    mongoCollection.countDocuments(query),
    getCollectionStatsByName(db, collectionName),
  ]);

  const estimatedReclaimableBytes = estimateReclaimableBytes({
    candidateCount,
    collectionStats,
  });

  return {
    collection: collectionName,
    dateField: safeDateField,
    olderThanDays: days,
    cutoffIso: cutoff.toISOString(),
    candidateCount,
    estimatedReclaimableBytes,
    collectionStats,
    notes: [
      'Estimate is based on average object size and is not guaranteed to be reclaimed physically on disk immediately.',
    ],
  };
}

async function executeCollectionCleanup({
  collection,
  olderThanDays,
  dateField = 'createdAt',
  limit,
  confirm,
}) {
  if (confirm !== true) {
    throw Object.assign(new Error('Cleanup confirmation is required (confirm=true)'), { code: 'VALIDATION' });
  }

  const db = ensureDbConnection();
  const collectionName = normalizeCollectionName(collection);
  const safeDateField = normalizeDateField(dateField);
  const days = normalizeOlderThanDays(olderThanDays);
  const maxDelete = normalizeLimit(limit, 5000);

  await ensureCollectionExists(db, collectionName);

  const start = Date.now();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const query = buildOlderThanQuery({ dateField: safeDateField, cutoff });
  const mongoCollection = db.collection(collectionName);

  const dryRun = await dryRunCollectionCleanup({
    collection: collectionName,
    olderThanDays: days,
    dateField: safeDateField,
  });

  let remaining = maxDelete;
  let deletedCount = 0;
  const batchSize = 1000;

  while (remaining > 0) {
    const currentBatch = Math.min(batchSize, remaining);
    const ids = await mongoCollection
      .find(query, { projection: { _id: 1 } })
      .sort({ _id: 1 })
      .limit(currentBatch)
      .toArray();

    if (!ids.length) break;

    const idList = ids.map((d) => d._id).filter(Boolean);
    if (!idList.length) break;

    const out = await mongoCollection.deleteMany({ _id: { $in: idList } });
    const deleted = Number(out?.deletedCount || 0);
    deletedCount += deleted;
    remaining -= idList.length;

    if (deleted === 0) break;
  }

  return {
    collection: collectionName,
    dateField: safeDateField,
    olderThanDays: days,
    cutoffIso: cutoff.toISOString(),
    limitApplied: maxDelete,
    dryRunCandidateCount: dryRun.candidateCount,
    deletedCount,
    estimatedReclaimableBytes: dryRun.estimatedReclaimableBytes,
    durationMs: Date.now() - start,
    notes: dryRun.notes,
  };
}

async function inferCollectionFields(collectionName, sampleSize = 10) {
  const db = ensureDbConnection();
  const coll = db.collection(normalizeCollectionName(collectionName));
  
  const docs = await coll.find({}).limit(sampleSize).toArray();
  const fieldSet = new Set();
  
  for (const doc of docs) {
    const keys = Object.keys(doc);
    for (const key of keys) {
      fieldSet.add(key);
    }
  }
  
  return Array.from(fieldSet).sort();
}

module.exports = {
  toSafeJsonError,
  getMongoGlobalStats,
  listCollectionStats,
  getOverviewStats,
  dryRunCollectionCleanup,
  executeCollectionCleanup,
  inferCollectionFields,
};
