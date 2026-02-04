const crypto = require('crypto');

const JsonConfig = require('../models/JsonConfig');

const cache = new Map();

function normalizeSlugBase(title) {
  const str = String(title || '').trim().toLowerCase();
  if (!str) return 'config';

  const slug = str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-');

  return slug || 'config';
}

function randomSuffix4() {
  return crypto.randomBytes(2).toString('hex');
}

async function generateUniqueSlugFromTitle(title, { maxAttempts = 10 } = {}) {
  const base = normalizeSlugBase(title);

  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = `${base}-${randomSuffix4()}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await JsonConfig.findOne({ slug: candidate }).select('_id').lean();
    if (!existing) return candidate;
  }

  throw new Error('Failed to generate unique slug');
}

function normalizeAlias(alias) {
  const str = String(alias || '').trim().toLowerCase();
  if (!str) return '';

  const normalized = str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-');

  return normalized;
}

async function validateAliasUniqueness(alias, excludeId = null) {
  if (!alias) return true;

  const normalizedAlias = normalizeAlias(alias);
  if (!normalizedAlias) return false;

  const query = {
    $or: [
      { slug: normalizedAlias },
      { alias: normalizedAlias }
    ]
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await JsonConfig.findOne(query).select('_id').lean();
  return !existing;
}

function computeJsonHash(jsonRaw) {
  return crypto.createHash('sha256').update(String(jsonRaw || ''), 'utf8').digest('hex');
}

function parseJsonOrThrow(jsonRaw) {
  try {
    return JSON.parse(String(jsonRaw));
  } catch (e) {
    const msg = e && e.message ? e.message : 'Invalid JSON';
    const err = new Error(msg);
    err.code = 'INVALID_JSON';
    throw err;
  }
}

function getCached(slug) {
  const entry = cache.get(slug);
  if (!entry) return null;
  if (typeof entry.expiresAt === 'number' && Date.now() > entry.expiresAt) {
    cache.delete(slug);
    return null;
  }
  return entry.value;
}

function setCached(slug, value, ttlSeconds) {
  const ttl = Number(ttlSeconds || 0);
  if (Number.isNaN(ttl) || ttl <= 0) return;
  cache.set(slug, { value, expiresAt: Date.now() + ttl * 1000 });
}

function clearJsonConfigCache(slug) {
  if (!slug) return;
  cache.delete(String(slug));
}

function clearAllJsonConfigCache() {
  cache.clear();
}

async function listJsonConfigs() {
  return JsonConfig.find()
    .sort({ updatedAt: -1 })
    .select('title slug alias publicEnabled cacheTtlSeconds updatedAt createdAt')
    .lean();
}

async function getJsonConfigById(id) {
  return JsonConfig.findById(id).lean();
}

async function createJsonConfig({ title, jsonRaw, publicEnabled = false, cacheTtlSeconds = 0, alias }) {
  console.log('createJsonConfig called with:', { title, jsonRaw, publicEnabled, cacheTtlSeconds, alias });
  
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) {
    const err = new Error('title is required');
    err.code = 'VALIDATION';
    throw err;
  }

  if (jsonRaw === undefined || jsonRaw === null) {
    const err = new Error('jsonRaw is required');
    err.code = 'VALIDATION';
    throw err;
  }

  parseJsonOrThrow(jsonRaw);

  let normalizedAlias = null;
  if (alias !== undefined && alias !== null) {
    normalizedAlias = normalizeAlias(alias);
    console.log('Normalized alias:', normalizedAlias);
    if (normalizedAlias && !(await validateAliasUniqueness(normalizedAlias))) {
      const err = new Error('Alias must be unique and not conflict with existing slugs or aliases');
      err.code = 'ALIAS_NOT_UNIQUE';
      throw err;
    }
  }

  const slug = await generateUniqueSlugFromTitle(normalizedTitle);

  const createData = {
    title: normalizedTitle,
    slug,
    alias: normalizedAlias || undefined,
    publicEnabled: Boolean(publicEnabled),
    cacheTtlSeconds: Number(cacheTtlSeconds || 0) || 0,
    jsonRaw: String(jsonRaw),
    jsonHash: computeJsonHash(String(jsonRaw)),
  };
  
  //console.log('Creating document with data:', createData);

  const doc = await JsonConfig.create(createData);
  //console.log('Created document:', doc.toObject());

  clearJsonConfigCache(slug);
  if (normalizedAlias) {
    clearJsonConfigCache(normalizedAlias);
  }
  return doc.toObject();
}

async function updateJsonConfig(id, patch) {
  console.log('updateJsonConfig called with id:', id, 'patch:', patch);
  
  const doc = await JsonConfig.findById(id);
  if (!doc) {
    const err = new Error('JSON config not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  console.log('Found document:', doc.toObject());

  const oldSlug = doc.slug;
  const oldAlias = doc.alias;

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'title')) {
    const title = String(patch.title || '').trim();
    if (!title) {
      const err = new Error('title is required');
      err.code = 'VALIDATION';
      throw err;
    }
    doc.title = title;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'publicEnabled')) {
    doc.publicEnabled = Boolean(patch.publicEnabled);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'cacheTtlSeconds')) {
    const ttl = Number(patch.cacheTtlSeconds || 0);
    doc.cacheTtlSeconds = Number.isNaN(ttl) ? 0 : Math.max(0, ttl);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'jsonRaw')) {
    if (patch.jsonRaw === null || patch.jsonRaw === undefined) {
      const err = new Error('jsonRaw is required');
      err.code = 'VALIDATION';
      throw err;
    }

    parseJsonOrThrow(patch.jsonRaw);
    doc.jsonRaw = String(patch.jsonRaw);
    doc.jsonHash = computeJsonHash(doc.jsonRaw);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'alias')) {
    const newAlias = patch.alias;
    console.log('Processing alias update. newAlias:', newAlias);
    
    if (newAlias === null || newAlias === undefined || newAlias === '') {
      doc.alias = undefined;
      console.log('Setting alias to undefined');
    } else {
      const normalizedAlias = normalizeAlias(newAlias);
      console.log('Normalized alias for update:', normalizedAlias);
      
      if (!normalizedAlias) {
        const err = new Error('Invalid alias format');
        err.code = 'VALIDATION';
        throw err;
      }
      
      if (!(await validateAliasUniqueness(normalizedAlias, id))) {
        const err = new Error('Alias must be unique and not conflict with existing slugs or aliases');
        err.code = 'ALIAS_NOT_UNIQUE';
        throw err;
      }
      
      doc.alias = normalizedAlias;
      console.log('Setting alias to:', normalizedAlias);
    }
  }

  if (!doc.slug || String(doc.slug).trim() === '') {
    doc.slug = await generateUniqueSlugFromTitle(doc.title);
  }

  console.log('Document before save:', doc.toObject());
  await doc.save();
  console.log('Document after save:', doc.toObject());

  clearJsonConfigCache(oldSlug);
  clearJsonConfigCache(doc.slug);
  if (oldAlias) {
    clearJsonConfigCache(oldAlias);
  }
  if (doc.alias) {
    clearJsonConfigCache(doc.alias);
  }
  return doc.toObject();
}

async function regenerateJsonConfigSlug(id) {
  const doc = await JsonConfig.findById(id);
  if (!doc) {
    const err = new Error('JSON config not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const oldSlug = doc.slug;
  doc.slug = await generateUniqueSlugFromTitle(doc.title);
  await doc.save();

  clearJsonConfigCache(oldSlug);
  clearJsonConfigCache(doc.slug);
  return doc.toObject();
}

async function deleteJsonConfig(id) {
  const doc = await JsonConfig.findByIdAndDelete(id).lean();
  if (!doc) {
    const err = new Error('JSON config not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  clearJsonConfigCache(doc.slug);
  return { success: true };
}

async function getJsonConfigValueBySlug(slug, opts = {}) {
  const key = String(slug || '').trim();
  if (!key) {
    const err = new Error('slug is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const bypassCache = Boolean(opts.bypassCache);

  if (!bypassCache) {
    const cached = getCached(key);
    if (cached !== null) return cached;
  }

  const doc = await JsonConfig.findOne({
    $or: [
      { slug: key },
      { alias: key }
    ]
  }).lean();
  
  if (!doc) {
    const err = new Error('JSON config not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const data = parseJsonOrThrow(doc.jsonRaw);

  // Cache under both the slug and the lookup key
  setCached(key, data, doc.cacheTtlSeconds);
  if (doc.slug !== key) {
    setCached(doc.slug, data, doc.cacheTtlSeconds);
  }
  if (doc.alias && doc.alias !== key) {
    setCached(doc.alias, data, doc.cacheTtlSeconds);
  }

  return data;
}

async function getJsonConfigPublicPayload(slug, { raw = false } = {}) {
  const key = String(slug || '').trim();
  if (!key) {
    const err = new Error('slug is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const doc = await JsonConfig.findOne({
    $or: [
      { slug: key },
      { alias: key }
    ]
  }).lean();

  if (!doc || doc.publicEnabled !== true) {
    const err = new Error('JSON config not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const data = await getJsonConfigValueBySlug(doc.slug);

  if (!raw) return data;

  return {
    slug: doc.slug,
    alias: doc.alias,
    title: doc.title,
    publicEnabled: Boolean(doc.publicEnabled),
    cacheTtlSeconds: Number(doc.cacheTtlSeconds || 0) || 0,
    updatedAt: doc.updatedAt,
    data,
  };
}

module.exports = {
  normalizeSlugBase,
  generateUniqueSlugFromTitle,
  parseJsonOrThrow,
  clearJsonConfigCache,
  clearAllJsonConfigCache,
  listJsonConfigs,
  getJsonConfigById,
  createJsonConfig,
  updateJsonConfig,
  regenerateJsonConfigSlug,
  deleteJsonConfig,
  getJsonConfig: getJsonConfigValueBySlug,
  getJsonConfigValueBySlug,
  getJsonConfigPublicPayload,
};
