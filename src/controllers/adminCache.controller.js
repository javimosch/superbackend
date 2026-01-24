const GlobalSetting = require('../models/GlobalSetting');
const cacheLayer = require('../services/cacheLayer.service');
const globalSettingsService = require('../services/globalSettings.service');
const { encryptString } = require('../utils/encryption');
const { logAuditSync } = require('../services/auditLogger');

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'CONFLICT') return { status: 409, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function audit(req, event) {
  logAuditSync({
    req,
    action: event.action,
    outcome: event.outcome,
    entityType: event.entityType || 'CacheLayer',
    entityId: event.entityId || null,
    targetType: event.targetType || 'CacheLayer',
    targetId: event.targetId || null,
    before: event.before || null,
    after: event.after || null,
    details: event.details || undefined,
  });
}

function normalizeNamespace(ns) {
  const v = String(ns || '').trim();
  return v || 'default';
}

function normalizeKey(key) {
  const v = String(key || '').trim();
  if (!v) throw Object.assign(new Error('key is required'), { code: 'VALIDATION' });
  return v;
}

async function upsertSetting({ key, type, description, value, public: isPublic = false }) {
  const existing = await GlobalSetting.findOne({ key });
  if (!existing) {
    const storedValue = type === 'encrypted' ? JSON.stringify(encryptString(String(value || ''))) : String(value ?? '');
    await GlobalSetting.create({
      key,
      type,
      description,
      value: storedValue,
      templateVariables: [],
      public: Boolean(isPublic),
    });
    return;
  }

  if (existing.type !== type) {
    existing.type = type;
  }

  if (existing.description !== description) {
    existing.description = description;
  }

  if (type === 'encrypted') {
    existing.value = JSON.stringify(encryptString(String(value || '')));
  } else {
    existing.value = String(value ?? '');
  }

  if (existing.public !== Boolean(isPublic)) {
    existing.public = Boolean(isPublic);
  }

  await existing.save();
}

exports.getConfig = async (req, res) => {
  try {
    const cfg = await cacheLayer.getConfig();

    res.json({
      config: {
        backend: cfg.backend,
        evictionPolicy: cfg.evictionPolicy,
        redisPrefix: cfg.redisPrefix,
        redisUrlConfigured: Boolean(cfg.redisUrl),
        offloadThresholdBytes: cfg.offloadThresholdBytes,
        maxEntryBytes: cfg.maxEntryBytes,
        defaultTtlSeconds: cfg.defaultTtlSeconds,
        atRestFormat: cfg.atRestFormat,
      },
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const payload = req.body || {};

    const backend = String(payload.backend || 'memory').toLowerCase();
    const evictionPolicy = String(payload.evictionPolicy || 'lru').toLowerCase();
    const redisUrl = payload.redisUrl;
    const redisPrefix = payload.redisPrefix;
    const offloadThresholdBytes = payload.offloadThresholdBytes;
    const maxEntryBytes = payload.maxEntryBytes;
    const defaultTtlSeconds = payload.defaultTtlSeconds;
    const atRestFormat = String(payload.atRestFormat || 'string').toLowerCase();

    const before = await cacheLayer.getConfig();

    await upsertSetting({
      key: 'CACHE_LAYER_BACKEND',
      type: 'string',
      description: 'Cache layer primary backend (memory or redis).',
      value: backend === 'redis' ? 'redis' : 'memory',
      public: false,
    });

    await upsertSetting({
      key: 'CACHE_LAYER_EVICTION_POLICY',
      type: 'string',
      description: 'Cache layer eviction policy for memory backend (fifo, lru, lfu).',
      value: ['fifo', 'lru', 'lfu'].includes(evictionPolicy) ? evictionPolicy : 'lru',
      public: false,
    });

    if (redisPrefix !== undefined) {
      await upsertSetting({
        key: 'CACHE_LAYER_REDIS_PREFIX',
        type: 'string',
        description: 'Redis key prefix for Cache Layer.',
        value: String(redisPrefix || 'superbackend:'),
        public: false,
      });
    }

    if (redisUrl !== undefined) {
      await upsertSetting({
        key: 'CACHE_LAYER_REDIS_URL',
        type: 'encrypted',
        description: 'Redis URL for Cache Layer (encrypted).',
        value: String(redisUrl || ''),
        public: false,
      });
    }

    if (offloadThresholdBytes !== undefined) {
      await upsertSetting({
        key: 'CACHE_LAYER_OFFLOAD_THRESHOLD_BYTES',
        type: 'number',
        description: 'In-memory cache offload threshold in bytes before spilling to Mongo.',
        value: String(offloadThresholdBytes),
        public: false,
      });
    }

    if (maxEntryBytes !== undefined) {
      await upsertSetting({
        key: 'CACHE_LAYER_MAX_ENTRY_BYTES',
        type: 'number',
        description: 'Maximum entry size in bytes for cache values.',
        value: String(maxEntryBytes),
        public: false,
      });
    }

    if (defaultTtlSeconds !== undefined) {
      await upsertSetting({
        key: 'CACHE_LAYER_DEFAULT_TTL_SECONDS',
        type: 'number',
        description: 'Default TTL in seconds for cache entries when not specified.',
        value: String(defaultTtlSeconds),
        public: false,
      });
    }

    await upsertSetting({
      key: 'CACHE_LAYER_AT_REST_FORMAT',
      type: 'string',
      description: 'Cache entry at-rest format (string or base64).',
      value: atRestFormat === 'base64' ? 'base64' : 'string',
      public: false,
    });

    globalSettingsService.clearSettingsCache();

    const after = await cacheLayer.getConfig();

    audit(req, {
      action: 'cache.config.update',
      outcome: 'success',
      entityType: 'CacheLayer',
      entityId: null,
      before,
      after,
    });

    res.json({ ok: true });
  } catch (err) {
    audit(req, {
      action: 'cache.config.update',
      outcome: 'failure',
      details: { error: err?.message || 'Operation failed' },
    });
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.listKeys = async (req, res) => {
  try {
    const namespace = req.query.namespace ? normalizeNamespace(req.query.namespace) : null;
    const prefix = req.query.prefix ? String(req.query.prefix) : null;

    const out = await cacheLayer.listKeys({ namespace, prefix });
    res.json({ items: out });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getEntry = async (req, res) => {
  try {
    const namespace = normalizeNamespace(req.query.namespace);
    const key = normalizeKey(req.query.key);

    const entry = await cacheLayer.getEntry(key, { namespace });
    if (!entry) return res.status(404).json({ error: 'Not found' });

    res.json({ item: entry });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.setEntry = async (req, res) => {
  try {
    const payload = req.body || {};
    const namespace = normalizeNamespace(payload.namespace);
    const key = normalizeKey(payload.key);
    const ttlSeconds = payload.ttlSeconds === undefined ? undefined : payload.ttlSeconds;
    const allowNoExpiry = payload.allowNoExpiry === undefined ? true : Boolean(payload.allowNoExpiry);
    const atRestFormat = payload.atRestFormat;

    const before = await cacheLayer.getEntry(key, { namespace }).catch(() => null);

    await cacheLayer.set(key, payload.value, { namespace, ttlSeconds, allowNoExpiry, atRestFormat });

    const after = await cacheLayer.getEntry(key, { namespace }).catch(() => null);

    audit(req, {
      action: 'cache.entry.set',
      outcome: 'success',
      targetType: 'CacheEntry',
      targetId: `${namespace}:${key}`,
      before,
      after,
    });

    res.json({ ok: true });
  } catch (err) {
    audit(req, {
      action: 'cache.entry.set',
      outcome: 'failure',
      details: { error: err?.message || 'Operation failed' },
    });
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const namespace = normalizeNamespace(req.query.namespace);
    const key = normalizeKey(req.query.key);

    const before = await cacheLayer.getEntry(key, { namespace }).catch(() => null);
    const result = await cacheLayer.delete(key, { namespace });

    audit(req, {
      action: 'cache.entry.delete',
      outcome: 'success',
      targetType: 'CacheEntry',
      targetId: `${namespace}:${key}`,
      before,
      after: null,
    });

    res.json({ ok: true, deleted: Boolean(result.ok) });
  } catch (err) {
    audit(req, {
      action: 'cache.entry.delete',
      outcome: 'failure',
      details: { error: err?.message || 'Operation failed' },
    });
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.clearCache = async (req, res) => {
  try {
    const payload = req.body || {};
    const backend = String(payload.backend || 'all');
    const namespace = payload.namespace ? normalizeNamespace(payload.namespace) : null;
    const prefix = payload.prefix ? String(payload.prefix) : null;

    const result = await cacheLayer.clear({ backend, namespace, prefix });

    audit(req, {
      action: 'cache.clear',
      outcome: 'success',
      details: { backend, namespace, prefix, cleared: result.cleared },
    });

    res.json(result);
  } catch (err) {
    audit(req, {
      action: 'cache.clear',
      outcome: 'failure',
      details: { error: err?.message || 'Operation failed' },
    });
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.metrics = async (req, res) => {
  try {
    const metrics = await cacheLayer.metrics();
    res.json({ metrics });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};
