const mongoose = require('mongoose');
const crypto = require('crypto');

const HeadlessModelDefinition = require('../models/HeadlessModelDefinition');

const MODEL_COLLECTION_PREFIX = 'headless_';

function normalizeCodeIdentifier(codeIdentifier) {
  const normalized = String(codeIdentifier || '').trim();
  if (!normalized) {
    const err = new Error('codeIdentifier is required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    const err = new Error('codeIdentifier must match /^[a-z][a-z0-9_]*$/');
    err.code = 'VALIDATION';
    throw err;
  }
  return normalized;
}

function computeSchemaHash({ fields, indexes }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ fields: fields || [], indexes: indexes || [] }))
    .digest('hex');
}

function toMongooseField(field) {
  const type = String(field.type || '').toLowerCase();
  const base = {};

  if (field.required) base.required = true;
  if (field.unique) base.unique = true;
  if (field.default !== undefined) base.default = field.default;

  if (field.validation && typeof field.validation === 'object') {
    if (field.validation.min !== undefined) base.min = field.validation.min;
    if (field.validation.max !== undefined) base.max = field.validation.max;
    if (field.validation.minLength !== undefined) base.minlength = field.validation.minLength;
    if (field.validation.maxLength !== undefined) base.maxlength = field.validation.maxLength;
    if (field.validation.enum !== undefined) base.enum = field.validation.enum;
    if (field.validation.match !== undefined) base.match = field.validation.match;
  }

  if (type === 'string') return { ...base, type: String };
  if (type === 'number') return { ...base, type: Number };
  if (type === 'boolean') return { ...base, type: Boolean };
  if (type === 'date') return { ...base, type: Date };

  if (type === 'object') return { ...base, type: mongoose.Schema.Types.Mixed };
  if (type === 'array') return { ...base, type: [mongoose.Schema.Types.Mixed] };

  if (type === 'ref' || type === 'reference') {
    const refModelCode = String(field.refModelCode || '').trim();
    if (!refModelCode) {
      const err = new Error(`Field ${field.name} is reference type but refModelCode is missing`);
      err.code = 'VALIDATION';
      throw err;
    }
    const refModelName = getMongooseModelName(refModelCode);
    return { ...base, type: mongoose.Schema.Types.ObjectId, ref: refModelName };
  }

  if (type === 'ref[]' || type === 'ref_array' || type === 'refarray') {
    const refModelCode = String(field.refModelCode || '').trim();
    if (!refModelCode) {
      const err = new Error(`Field ${field.name} is reference array type but refModelCode is missing`);
      err.code = 'VALIDATION';
      throw err;
    }
    const refModelName = getMongooseModelName(refModelCode);
    return [{ ...base, type: mongoose.Schema.Types.ObjectId, ref: refModelName }];
  }

  const err = new Error(`Unsupported field type: ${field.type}`);
  err.code = 'VALIDATION';
  throw err;
}

function getMongooseModelName(codeIdentifier) {
  const code = normalizeCodeIdentifier(codeIdentifier);
  return `Headless_${code}`;
}

function getMongoCollectionName(codeIdentifier) {
  const code = normalizeCodeIdentifier(codeIdentifier);
  return `${MODEL_COLLECTION_PREFIX}${code}`;
}

function isExternalDefinition(def) {
  return def && (def.sourceType === 'external' || def.isExternal === true);
}

function getCollectionNameForDefinition(def) {
  if (isExternalDefinition(def)) {
    const cn = String(def.sourceCollectionName || '').trim();
    return cn || getMongoCollectionName(def.codeIdentifier);
  }
  return getMongoCollectionName(def.codeIdentifier);
}

function buildSchemaFromDefinition(def) {
  const schemaShape = {};
  for (const field of def.fields || []) {
    const fieldName = String(field.name || '').trim();
    if (!fieldName) continue;
    if (fieldName === '_id') continue;

    schemaShape[fieldName] = toMongooseField(field);
  }

  if (!isExternalDefinition(def)) {
    schemaShape._headlessModelCode = { type: String, default: def.codeIdentifier, index: true };
    schemaShape._headlessSchemaVersion = { type: Number, default: def.version, index: true };
  }

  const schema = new mongoose.Schema(schemaShape, {
    timestamps: true,
    collection: getCollectionNameForDefinition(def),
    strict: false,
  });

  const indexes = Array.isArray(def.indexes) ? def.indexes : [];
  for (const idx of indexes) {
    if (!idx || typeof idx !== 'object') continue;
    const fields = idx.fields;
    if (!fields) continue;
    const options = idx.options && typeof idx.options === 'object' ? idx.options : {};
    schema.index(fields, options);
  }

  return schema;
}

async function ensureIndexesBestEffort(Model) {
  try {
    if (!Model || !Model.collection || typeof Model.collection.createIndex !== 'function') return;
    const declared = Array.isArray(Model.schema && Model.schema.indexes)
      ? Model.schema.indexes()
      : [];
    for (const idx of declared) {
      const fields = idx && idx[0];
      const options = idx && idx[1];
      if (!fields) continue;
      try {
        await Model.collection.createIndex(fields, options || {});
      } catch (e) {
        // best-effort
      }
    }
  } catch (e) {
    // best-effort
  }
}

async function listModelDefinitions() {
  return HeadlessModelDefinition.find({ isActive: true }).sort({ updatedAt: -1 }).lean();
}

async function getModelDefinitionByCode(codeIdentifier) {
  const code = normalizeCodeIdentifier(codeIdentifier);
  return HeadlessModelDefinition.findOne({ codeIdentifier: code, isActive: true }).lean();
}

async function createModelDefinition(payload) {
  const codeIdentifier = normalizeCodeIdentifier(payload.codeIdentifier);
  const displayName = String(payload.displayName || codeIdentifier).trim();
  if (!displayName) {
    const err = new Error('displayName is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const indexes = Array.isArray(payload.indexes) ? payload.indexes : [];
  const fieldsHash = computeSchemaHash({ fields, indexes });

  const existing = await HeadlessModelDefinition.findOne({ codeIdentifier }).lean();
  if (existing) {
    const err = new Error('Model already exists');
    err.code = 'CONFLICT';
    throw err;
  }

  const doc = await HeadlessModelDefinition.create({
    codeIdentifier,
    displayName,
    description: String(payload.description || ''),
    fields,
    indexes,
    fieldsHash,
    version: 1,
    previousFields: [],
    previousIndexes: [],
    isActive: true,
  });

  return doc.toObject();
}

async function updateModelDefinition(codeIdentifier, updates) {
  const code = normalizeCodeIdentifier(codeIdentifier);
  const doc = await HeadlessModelDefinition.findOne({ codeIdentifier: code, isActive: true });
  if (!doc) {
    const err = new Error('Model not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (updates.displayName !== undefined) {
    const displayName = String(updates.displayName || '').trim();
    if (!displayName) {
      const err = new Error('displayName is required');
      err.code = 'VALIDATION';
      throw err;
    }
    doc.displayName = displayName;
  }

  if (updates.description !== undefined) {
    doc.description = String(updates.description || '');
  }

  if (updates.fields !== undefined) {
    const fields = Array.isArray(updates.fields) ? updates.fields : [];
    const indexes = Array.isArray(doc.indexes) ? doc.indexes : [];
    const newHash = computeSchemaHash({ fields, indexes });
    if (newHash !== doc.fieldsHash) {
      doc.previousFields = doc.fields;
      doc.fields = fields;
      doc.fieldsHash = newHash;
      doc.version = Number(doc.version || 1) + 1;
    }
  }

  if (updates.indexes !== undefined) {
    const nextIndexes = Array.isArray(updates.indexes) ? updates.indexes : [];
    const fields = Array.isArray(doc.fields) ? doc.fields : [];
    const newHash = computeSchemaHash({ fields, indexes: nextIndexes });
    if (newHash !== doc.fieldsHash) {
      doc.previousIndexes = doc.indexes;
      doc.indexes = nextIndexes;
      doc.fieldsHash = newHash;
      doc.version = Number(doc.version || 1) + 1;
    }
  }

  await doc.save();
  return doc.toObject();
}

async function disableModelDefinition(codeIdentifier) {
  const code = normalizeCodeIdentifier(codeIdentifier);
  const doc = await HeadlessModelDefinition.findOne({ codeIdentifier: code, isActive: true });
  if (!doc) {
    const err = new Error('Model not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  doc.isActive = false;
  await doc.save();
  return doc.toObject();
}

const modelCache = new Map();

async function ensureAutoMigration(modelDef) {
  if (isExternalDefinition(modelDef)) return;

  const collectionName = getMongoCollectionName(modelDef.codeIdentifier);
  const coll = mongoose.connection.collection(collectionName);

  const currentFields = Array.isArray(modelDef.fields) ? modelDef.fields : [];
  const previousFields = Array.isArray(modelDef.previousFields) ? modelDef.previousFields : [];

  const currentFieldNames = new Set(
    currentFields
      .map((f) => String(f?.name || '').trim())
      .filter((n) => n && n !== '_id'),
  );
  const previousFieldNames = new Set(
    previousFields
      .map((f) => String(f?.name || '').trim())
      .filter((n) => n && n !== '_id'),
  );

  const addedFields = currentFields.filter((f) => {
    const n = String(f?.name || '').trim();
    return n && !previousFieldNames.has(n);
  });

  const removedFieldNames = Array.from(previousFieldNames).filter((n) => !currentFieldNames.has(n));

  const setOps = { _headlessSchemaVersion: modelDef.version };
  const unsetOps = {};

  for (const f of addedFields) {
    const name = String(f?.name || '').trim();
    if (!name) continue;
    if (f.default !== undefined) {
      setOps[name] = f.default;
    }
  }

  for (const name of removedFieldNames) {
    unsetOps[name] = '';
  }

  const update = { $set: setOps };
  if (Object.keys(unsetOps).length > 0) update.$unset = unsetOps;

  const filter = { _headlessSchemaVersion: { $ne: modelDef.version } };
  if (addedFields.length > 0) {
    filter.$or = [
      { _headlessSchemaVersion: { $ne: modelDef.version } },
      ...addedFields
        .map((f) => String(f?.name || '').trim())
        .filter((n) => n)
        .map((name) => ({ [name]: { $exists: false } })),
    ];
  }

  await coll.updateMany(filter, update);
}

async function getDynamicModel(codeIdentifier) {
  const def = await getModelDefinitionByCode(codeIdentifier);
  if (!def) {
    const err = new Error('Model not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const collectionName = getCollectionNameForDefinition(def);
  const cacheKey = `${def.codeIdentifier}:${def.version}:${def.fieldsHash}:${collectionName}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;

  const modelName = getMongooseModelName(def.codeIdentifier);

  if (mongoose.models[modelName]) {
    delete mongoose.models[modelName];
  }
  if (mongoose.modelSchemas && mongoose.modelSchemas[modelName]) {
    delete mongoose.modelSchemas[modelName];
  }

  const schema = buildSchemaFromDefinition(def);
  const Model = mongoose.model(modelName, schema);

  if (!isExternalDefinition(def)) {
    await ensureAutoMigration(def);
    await ensureIndexesBestEffort(Model);
  }

  modelCache.set(cacheKey, Model);
  return Model;
}

module.exports = {
  MODEL_COLLECTION_PREFIX,
  normalizeCodeIdentifier,
  getMongooseModelName,
  getMongoCollectionName,
  getCollectionNameForDefinition,
  computeSchemaHash,
  listModelDefinitions,
  getModelDefinitionByCode,
  createModelDefinition,
  updateModelDefinition,
  disableModelDefinition,
  getDynamicModel,
};
