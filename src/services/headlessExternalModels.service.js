const mongoose = require('mongoose');

const HeadlessModelDefinition = require('../models/HeadlessModelDefinition');
const { normalizeCodeIdentifier, computeSchemaHash } = require('./headlessModels.service');

function isObjectId(value) {
  if (!value) return false;
  if (value instanceof mongoose.Types.ObjectId) return true;
  if (value && typeof value === 'object' && value._bsontype === 'ObjectID') return true;
  return false;
}

function detectFieldType(value) {
  if (value === null || value === undefined) return null;
  if (isObjectId(value)) return 'objectid';
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'object') return 'object';
  return null;
}

function pickBestType(seenTypes) {
  const types = new Set(Array.from(seenTypes || []).filter(Boolean));
  if (types.size === 0) return { type: 'object', warning: 'No non-null sample values' };
  if (types.size === 1) return { type: Array.from(types)[0], warning: null };
  if (types.has('array')) return { type: 'array', warning: `Mixed types: ${Array.from(types).join('|')}` };
  if (types.has('object')) return { type: 'object', warning: `Mixed types: ${Array.from(types).join('|')}` };
  return { type: 'string', warning: `Mixed types: ${Array.from(types).join('|')}` };
}

function tryInferRefFromFieldName(fieldName, externalModelsByCollection) {
  const name = String(fieldName || '').trim();
  if (!name) return null;

  const lower = name.toLowerCase();
  if (!lower.endsWith('id') || lower === 'id') return null;

  const stem = name.slice(0, -2);
  const candidates = [stem, `${stem}s`, `${stem}es`];
  for (const c of candidates) {
    const match = externalModelsByCollection.get(String(c).toLowerCase());
    if (match) return match;
  }
  return null;
}

function normalizeIndexFromMongo(idx) {
  if (!idx || typeof idx !== 'object') return null;
  const fields = idx.key;
  if (!fields || typeof fields !== 'object') return null;

  const options = { ...idx };
  delete options.key;
  delete options.v;
  delete options.ns;

  return { fields, options };
}

async function listExternalCollections({ q, includeSystem } = {}) {
  if (!mongoose.connection || !mongoose.connection.db) {
    const err = new Error('Mongo connection not ready');
    err.code = 'VALIDATION';
    throw err;
  }

  const filter = {};
  if (q) filter.name = { $regex: String(q), $options: 'i' };

  const cursor = await mongoose.connection.db.listCollections(filter, { nameOnly: true });
  const items = await cursor.toArray();

  const out = [];
  for (const c of items) {
    const name = String(c && c.name ? c.name : '').trim();
    if (!name) continue;
    if (!includeSystem && name.startsWith('system.')) continue;
    out.push({ name, type: 'collection' });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function inferExternalModelFromCollection({ collectionName, sampleSize = 200 } = {}) {
  if (!mongoose.connection || !mongoose.connection.db) {
    const err = new Error('Mongo connection not ready');
    err.code = 'VALIDATION';
    throw err;
  }

  const collName = String(collectionName || '').trim();
  if (!collName) {
    const err = new Error('collectionName is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const N = Math.max(1, Math.min(Number(sampleSize) || 200, 1000));
  const coll = mongoose.connection.db.collection(collName);

  let docs;
  try {
    docs = await coll.aggregate([{ $sample: { size: N } }]).toArray();
  } catch {
    docs = await coll.find({}).limit(N).toArray();
  }

  const externalModels = await HeadlessModelDefinition.find({ isActive: true, sourceType: 'external' })
    .select({ codeIdentifier: 1, sourceCollectionName: 1 })
    .lean();

  const externalModelsByCollection = new Map();
  for (const m of externalModels || []) {
    const cn = String(m?.sourceCollectionName || '').trim();
    const code = String(m?.codeIdentifier || '').trim();
    if (cn && code) externalModelsByCollection.set(cn.toLowerCase(), code);
  }

  const perField = new Map();
  const warnings = [];

  for (const doc of docs || []) {
    if (!doc || typeof doc !== 'object') continue;
    for (const [k, v] of Object.entries(doc)) {
      if (!k || k === '_id') continue;
      const type = detectFieldType(v);
      let stats = perField.get(k);
      if (!stats) {
        stats = { seenTypes: new Set(), objectIdCount: 0, nonNullCount: 0 };
        perField.set(k, stats);
      }
      if (type) stats.seenTypes.add(type);
      if (type === 'objectid') stats.objectIdCount += 1;
      if (v !== null && v !== undefined) stats.nonNullCount += 1;
    }
  }

  const fields = [];
  for (const [name, stats] of perField.entries()) {
    const { type, warning } = pickBestType(stats.seenTypes);

    if (warning) warnings.push(`Field ${name}: ${warning}`);

    if (type === 'objectid') {
      const refModelCode = tryInferRefFromFieldName(name, externalModelsByCollection);
      if (refModelCode) {
        fields.push({ name, type: 'ref', required: false, unique: false, refModelCode });
      } else {
        fields.push({ name, type: 'string', required: false, unique: false });
      }
      continue;
    }

    if (type === 'date') {
      fields.push({ name, type: 'date', required: false, unique: false });
      continue;
    }

    if (type === 'array') {
      fields.push({ name, type: 'array', required: false, unique: false });
      continue;
    }

    if (type === 'object') {
      fields.push({ name, type: 'object', required: false, unique: false });
      continue;
    }

    if (type === 'number' || type === 'boolean' || type === 'string') {
      fields.push({ name, type, required: false, unique: false });
      continue;
    }

    fields.push({ name, type: 'object', required: false, unique: false });
  }

  fields.sort((a, b) => a.name.localeCompare(b.name));

  let indexes = [];
  try {
    const idx = await coll.indexes();
    indexes = (idx || []).map(normalizeIndexFromMongo).filter(Boolean);
  } catch {
    indexes = [];
  }

  const fieldsHash = computeSchemaHash({ fields, indexes });

  return {
    collectionName: collName,
    fields,
    indexes,
    warnings,
    stats: {
      sampled: (docs || []).length,
      maxSampleSize: N,
      fields: fields.length,
    },
    fieldsHash,
  };
}

async function createOrUpdateExternalModel({ collectionName, codeIdentifier, displayName, sampleSize } = {}) {
  const cn = String(collectionName || '').trim();
  if (!cn) {
    const err = new Error('collectionName is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const code = normalizeCodeIdentifier(codeIdentifier);
  if (!code.startsWith('ext_')) {
    const err = new Error('External model codeIdentifier must start with ext_');
    err.code = 'VALIDATION';
    throw err;
  }

  const name = String(displayName || code).trim();
  if (!name) {
    const err = new Error('displayName is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const inferred = await inferExternalModelFromCollection({ collectionName: cn, sampleSize });

  const existing = await HeadlessModelDefinition.findOne({ codeIdentifier: code, isActive: true });
  if (!existing) {
    const doc = await HeadlessModelDefinition.create({
      codeIdentifier: code,
      displayName: name,
      description: '',
      fields: inferred.fields,
      indexes: inferred.indexes,
      fieldsHash: inferred.fieldsHash,
      version: 1,
      previousFields: [],
      previousIndexes: [],
      sourceType: 'external',
      sourceCollectionName: cn,
      isExternal: true,
      inference: {
        enabled: true,
        lastInferredAt: new Date(),
        sampleSize: Number(sampleSize) || null,
        warnings: inferred.warnings || [],
        stats: inferred.stats || null,
      },
      isActive: true,
    });

    return { created: true, item: doc.toObject(), inference: inferred };
  }

  existing.displayName = name;
  existing.sourceType = 'external';
  existing.sourceCollectionName = cn;
  existing.isExternal = true;

  const newHash = inferred.fieldsHash;
  if (newHash !== existing.fieldsHash) {
    existing.previousFields = existing.fields;
    existing.previousIndexes = existing.indexes;
    existing.fields = inferred.fields;
    existing.indexes = inferred.indexes;
    existing.fieldsHash = newHash;
    existing.version = Number(existing.version || 1) + 1;
  }

  existing.inference = {
    enabled: true,
    lastInferredAt: new Date(),
    sampleSize: Number(sampleSize) || null,
    warnings: inferred.warnings || [],
    stats: inferred.stats || null,
  };

  await existing.save();

  return { created: false, item: existing.toObject(), inference: inferred };
}

module.exports = {
  listExternalCollections,
  inferExternalModelFromCollection,
  createOrUpdateExternalModel,
};
