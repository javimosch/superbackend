const crypto = require('crypto');

const JsonConfig = require('../models/JsonConfig');
const { parseJsonOrThrow, clearJsonConfigCache } = require('./jsonConfigs.service');

const REGISTRY_CONFIG_KEY = 'open-registry-registries';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRegistryId(id) {
  return String(id || '').trim().toLowerCase();
}

function normalizeItem(item = {}) {
  const createdAt = item.created_at || nowIso();
  const updatedAt = nowIso();
  const versions = Array.isArray(item.versions)
    ? item.versions.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0)
    : [];
  const latestVersion = Number(item.version);
  if (Number.isInteger(latestVersion) && latestVersion > 0 && !versions.includes(latestVersion)) {
    versions.push(latestVersion);
  }

  const safeVersions = Array.from(new Set(versions)).sort((a, b) => a - b);
  const finalVersion = safeVersions.length > 0 ? safeVersions[safeVersions.length - 1] : 1;

  return {
    id: String(item.id || '').trim(),
    name: String(item.name || item.id || '').trim(),
    category: String(item.category || 'general').trim(),
    version: finalVersion,
    versions: safeVersions.length > 0 ? safeVersions : [finalVersion],
    description: String(item.description || '').trim(),
    public: item.public !== false,
    tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    created_at: createdAt,
    updated_at: updatedAt,
    metadata: item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? item.metadata
      : {},
  };
}

async function ensureRegistryConfigDoc() {
  const existing = await JsonConfig.findOne({
    $or: [{ slug: REGISTRY_CONFIG_KEY }, { alias: REGISTRY_CONFIG_KEY }],
  });
  if (existing) return existing;

  const payload = {
    version: 1,
    registries: {},
  };

  const doc = await JsonConfig.create({
    title: 'Open Registry Registries',
    slug: REGISTRY_CONFIG_KEY,
    alias: REGISTRY_CONFIG_KEY,
    publicEnabled: false,
    cacheTtlSeconds: 0,
    jsonRaw: JSON.stringify(payload, null, 2),
    jsonHash: sha256(JSON.stringify(payload)),
  });

  clearJsonConfigCache(REGISTRY_CONFIG_KEY);
  return doc;
}

async function getConfig() {
  const doc = await ensureRegistryConfigDoc();
  const data = parseJsonOrThrow(String(doc.jsonRaw || '{}'));
  if (!data.registries || typeof data.registries !== 'object') {
    data.registries = {};
  }
  return { doc, data };
}

async function saveConfig(doc, data) {
  doc.jsonRaw = JSON.stringify(data, null, 2);
  doc.jsonHash = sha256(doc.jsonRaw);
  await doc.save();
  clearJsonConfigCache(REGISTRY_CONFIG_KEY);
}

function sanitizeRegistryResponse(registry) {
  return {
    id: registry.id,
    name: registry.name,
    description: registry.description,
    public: registry.public !== false,
    categories: Array.isArray(registry.categories) ? registry.categories : [],
    protocol_version: registry.protocol_version || '1.1.0',
    version: registry.version || '1.0.0',
    created_at: registry.created_at,
    updated_at: registry.updated_at,
    items_count: Object.keys(registry.items || {}).length,
    tokens_count: Array.isArray(registry.tokens) ? registry.tokens.length : 0,
  };
}

async function ensureRegistry(registryInput) {
  const { doc, data } = await getConfig();
  const id = normalizeRegistryId(registryInput.id);
  if (!id) throw new Error('registry id is required');

  if (data.registries[id]) {
    return data.registries[id];
  }

  const created = nowIso();
  data.registries[id] = {
    id,
    name: String(registryInput.name || id),
    description: String(registryInput.description || ''),
    public: registryInput.public === true,
    categories: Array.isArray(registryInput.categories) && registryInput.categories.length > 0
      ? registryInput.categories.map((c) => String(c).trim()).filter(Boolean)
      : ['plugins'],
    protocol_version: '1.1.0',
    version: String(registryInput.version || '1.0.0'),
    items: {},
    tokens: [],
    created_at: created,
    updated_at: created,
  };

  await saveConfig(doc, data);
  return data.registries[id];
}

async function listRegistries() {
  const { data } = await getConfig();
  return Object.values(data.registries || {}).map(sanitizeRegistryResponse);
}

async function getRegistry(registryId) {
  const { data } = await getConfig();
  return data.registries[normalizeRegistryId(registryId)] || null;
}

async function createRegistry(payload) {
  const { doc, data } = await getConfig();
  const id = normalizeRegistryId(payload.id);
  if (!id) {
    const err = new Error('id is required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (data.registries[id]) {
    const err = new Error('registry already exists');
    err.code = 'CONFLICT';
    throw err;
  }

  const created = nowIso();
  data.registries[id] = {
    id,
    name: String(payload.name || id),
    description: String(payload.description || ''),
    public: payload.public === true,
    categories: Array.isArray(payload.categories) && payload.categories.length > 0
      ? payload.categories.map((c) => String(c).trim()).filter(Boolean)
      : ['general'],
    protocol_version: '1.1.0',
    version: String(payload.version || '1.0.0'),
    items: {},
    tokens: [],
    created_at: created,
    updated_at: created,
  };

  await saveConfig(doc, data);
  return sanitizeRegistryResponse(data.registries[id]);
}

async function updateRegistry(registryId, patch) {
  const { doc, data } = await getConfig();
  const id = normalizeRegistryId(registryId);
  const registry = data.registries[id];
  if (!registry) {
    const err = new Error('registry not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (patch.name !== undefined) registry.name = String(patch.name || '').trim() || registry.name;
  if (patch.description !== undefined) registry.description = String(patch.description || '');
  if (patch.public !== undefined) registry.public = Boolean(patch.public);
  if (patch.categories !== undefined && Array.isArray(patch.categories)) {
    registry.categories = patch.categories.map((c) => String(c).trim()).filter(Boolean);
  }
  registry.updated_at = nowIso();

  await saveConfig(doc, data);
  return sanitizeRegistryResponse(registry);
}

async function deleteRegistry(registryId) {
  const { doc, data } = await getConfig();
  const id = normalizeRegistryId(registryId);
  if (!data.registries[id]) {
    const err = new Error('registry not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  delete data.registries[id];
  await saveConfig(doc, data);
  return { success: true };
}

function makeTokenValue() {
  return crypto.randomBytes(24).toString('hex');
}

async function createToken(registryId, payload = {}) {
  const { doc, data } = await getConfig();
  const id = normalizeRegistryId(registryId);
  const registry = data.registries[id];
  if (!registry) {
    const err = new Error('registry not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const tokenValue = makeTokenValue();
  const token = {
    id: crypto.randomBytes(8).toString('hex'),
    name: String(payload.name || 'token'),
    token_hash: sha256(tokenValue),
    scopes: Array.isArray(payload.scopes) && payload.scopes.length > 0 ? payload.scopes : ['read'],
    enabled: payload.enabled !== false,
    created_at: nowIso(),
  };

  registry.tokens = Array.isArray(registry.tokens) ? registry.tokens : [];
  registry.tokens.push(token);
  registry.updated_at = nowIso();

  await saveConfig(doc, data);
  return {
    token: { ...token, token_hash: undefined },
    tokenValue,
  };
}

async function deleteToken(registryId, tokenId) {
  const { doc, data } = await getConfig();
  const id = normalizeRegistryId(registryId);
  const registry = data.registries[id];
  if (!registry) {
    const err = new Error('registry not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const before = registry.tokens?.length || 0;
  registry.tokens = (registry.tokens || []).filter((t) => t.id !== tokenId);
  if ((registry.tokens || []).length === before) {
    const err = new Error('token not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  registry.updated_at = nowIso();
  await saveConfig(doc, data);
  return { success: true };
}

function hasValidToken(registry, authHeader) {
  const expectedPrefix = 'Bearer ';
  if (!authHeader || !String(authHeader).startsWith(expectedPrefix)) return false;
  const raw = String(authHeader).slice(expectedPrefix.length).trim();
  if (!raw) return false;
  const hash = sha256(raw);
  return (registry.tokens || []).some((token) => token.enabled !== false && token.token_hash === hash);
}

function applyListQuery(items, query = {}, includePrivate = false) {
  const category = query.category ? String(query.category) : null;
  const version = query.version !== undefined ? String(query.version) : null;
  const minimal = String(query.minimal || 'false') === 'true';
  const filter = query.filter ? String(query.filter).toLowerCase() : '';

  let rows = items.filter((item) => includePrivate || item.public !== false);

  if (category) rows = rows.filter((item) => item.category === category);
  if (filter) {
    rows = rows.filter((item) => {
      const target = `${item.id} ${item.name} ${item.description} ${(item.tags || []).join(' ')}`.toLowerCase();
      return target.includes(filter);
    });
  }

  if (version === 'latest') {
    rows = rows.map((item) => ({ ...item, version: Math.max(...(item.versions || [item.version])) }));
  } else if (version && Number.isInteger(Number(version))) {
    const v = Number(version);
    rows = rows.filter((item) => (item.versions || []).includes(v));
    rows = rows.map((item) => ({ ...item, version: v }));
  }

  if (minimal) {
    rows = rows.map(({ metadata, ...rest }) => rest);
  }

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const start = (page - 1) * limit;

  return {
    pagination: {
      page,
      limit,
      total_items: totalItems,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
      category,
      version: version || null,
    },
    items: rows.slice(start, start + limit),
  };
}

async function listItemsForRegistry(registryId, query = {}, authHeader) {
  const registry = await getRegistry(registryId);
  if (!registry) {
    const err = new Error('registry not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const canReadPrivate = registry.public === true ? true : hasValidToken(registry, authHeader);
  const items = Object.values(registry.items || {});
  const result = applyListQuery(items, query, canReadPrivate);

  return {
    registry: {
      name: registry.name,
      version: registry.version || '1.0.0',
      description: registry.description,
      categories: registry.categories || [],
      protocol_version: registry.protocol_version || '1.1.0',
    },
    pagination: result.pagination,
    items: result.items,
  };
}

async function getAuthStatus(registryId, authHeader) {
  const registry = await getRegistry(registryId);
  if (!registry) {
    const err = new Error('registry not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (registry.public === true) {
    return {
      public: true,
      requires_auth: false,
      auth_type: 'none',
      scope: 'read',
      message: 'This registry is publicly accessible',
    };
  }

  const valid = hasValidToken(registry, authHeader);
  return {
    public: false,
    requires_auth: true,
    auth_type: 'bearer',
    scope: valid ? 'read' : 'none',
    message: valid ? 'Authenticated access granted' : 'Token invalid or expired',
  };
}

async function upsertItem(registryId, itemPayload) {
  const { doc, data } = await getConfig();
  const id = normalizeRegistryId(registryId);
  const registry = data.registries[id];
  if (!registry) {
    const err = new Error('registry not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const normalized = normalizeItem(itemPayload);
  if (!normalized.id) {
    const err = new Error('item id is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const existing = registry.items?.[normalized.id];
  if (existing) {
    normalized.created_at = existing.created_at || normalized.created_at;
  }

  registry.items = registry.items || {};
  registry.items[normalized.id] = normalized;
  registry.updated_at = nowIso();
  await saveConfig(doc, data);
  return normalized;
}

async function deleteItem(registryId, itemId) {
  const { doc, data } = await getConfig();
  const id = normalizeRegistryId(registryId);
  const registry = data.registries[id];
  if (!registry) {
    const err = new Error('registry not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  registry.items = registry.items || {};
  if (!registry.items[itemId]) {
    const err = new Error('item not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  delete registry.items[itemId];
  registry.updated_at = nowIso();
  await saveConfig(doc, data);
  return { success: true };
}

module.exports = {
  REGISTRY_CONFIG_KEY,
  ensureRegistry,
  listRegistries,
  getRegistry,
  createRegistry,
  updateRegistry,
  deleteRegistry,
  createToken,
  deleteToken,
  listItemsForRegistry,
  getAuthStatus,
  upsertItem,
  deleteItem,
};
