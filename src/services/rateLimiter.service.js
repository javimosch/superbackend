const crypto = require('crypto');
const mongoose = require('mongoose');

const JsonConfig = require('../models/JsonConfig');
const RateLimitCounter = require('../models/RateLimitCounter');
const RateLimitMetricBucket = require('../models/RateLimitMetricBucket');

const { parseJsonOrThrow, clearJsonConfigCache } = require('./jsonConfigs.service');
const { verifyAccessToken } = require('../utils/jwt');

const RATE_LIMITS_KEY = 'rate-limits';

const registry = new Map();
const bootstrapState = new Map();

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base;
  if (!base || typeof base !== 'object') return override;
  if (Array.isArray(base) || Array.isArray(override)) return override;

  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function getClientIp(req) {
  const fromExpress = req.ip;
  if (fromExpress) return String(fromExpress);
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return 'unknown';
}

function tryExtractUserIdFromBearer(req) {
  try {
    if (req.user?._id) return String(req.user._id);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const decoded = verifyAccessToken(token);
    if (!decoded?.userId) return null;
    return String(decoded.userId);
  } catch (_) {
    return null;
  }
}

async function ensureRateLimitsJsonConfigExists() {
  const existing = await JsonConfig.findOne({ $or: [{ slug: RATE_LIMITS_KEY }, { alias: RATE_LIMITS_KEY }] });
  if (existing) return existing;

  const defaultConfig = {
    version: 1,
    defaults: {
      enabled: false,
      mode: 'reportOnly',
      algorithm: 'fixedWindow',
      limit: { max: 600, windowMs: 60000 },
      identity: { type: 'userIdOrIp' },
      metrics: { enabled: true, bucketMs: 60000, retentionDays: 14 },
      store: { ttlBufferMs: 60000, failOpen: true },
    },
    limiters: {},
  };

  const doc = await JsonConfig.create({
    title: 'Rate Limits',
    slug: RATE_LIMITS_KEY,
    alias: RATE_LIMITS_KEY,
    publicEnabled: false,
    cacheTtlSeconds: 0,
    jsonRaw: JSON.stringify(defaultConfig, null, 2),
    jsonHash: sha256(JSON.stringify(defaultConfig)),
  });

  clearJsonConfigCache(RATE_LIMITS_KEY);
  return doc;
}

async function getRateLimitsConfigDoc() {
  const doc = await ensureRateLimitsJsonConfigExists();
  return doc;
}

async function getRateLimitsConfigData() {
  const doc = await ensureRateLimitsJsonConfigExists();
  const jsonRaw = String(doc.jsonRaw || '');
  const data = parseJsonOrThrow(jsonRaw);
  return { doc, data };
}

function normalizeLimiterId(limiterId) {
  const id = String(limiterId || '').trim();
  if (!id) throw new Error('limiterId is required');
  return id;
}

function registerLimiter(limiterId, { label, integration, inferredMountPath } = {}) {
  const id = normalizeLimiterId(limiterId);

  const existing = registry.get(id) || { id, label: id, integration: null };
  const next = { ...existing };

  if (label) next.label = String(label);

  if (integration && typeof integration === 'object' && !Array.isArray(integration)) {
    next.integration = { ...(existing.integration || {}), ...integration };
  }

  if (inferredMountPath && (!next.integration || !next.integration.mountPath)) {
    next.integration = { ...(next.integration || {}), mountPath: String(inferredMountPath) };
  }

  registry.set(id, next);
  return next;
}

async function ensureLimiterOverrideExists(limiterId) {
  const id = normalizeLimiterId(limiterId);

  const state = bootstrapState.get(id) || { inFlight: null, done: false, scheduled: false };
  if (state.done) return;
  if (state.inFlight) return state.inFlight;

  if (mongoose.connection.readyState !== 1) {
    if (!state.scheduled) {
      state.scheduled = true;
      bootstrapState.set(id, state);
      if (mongoose.connection && typeof mongoose.connection.once === 'function') {
        mongoose.connection.once('connected', () => {
          ensureLimiterOverrideExists(id);
        });
      }
    }
    return;
  }

  const p = (async () => {
    const { doc, data } = await getRateLimitsConfigData();
    const existing = data?.limiters && data.limiters[id];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      state.done = true;
      return;
    }

    const updated = {
      version: Number(data?.version || 1) || 1,
      defaults: data?.defaults || {},
      limiters: { ...(data?.limiters || {}), [id]: { enabled: false } },
    };

    doc.jsonRaw = JSON.stringify(updated, null, 2);
    doc.jsonHash = sha256(doc.jsonRaw);
    await doc.save();
    clearJsonConfigCache(RATE_LIMITS_KEY);

    state.done = true;
  })()
    .catch((error) => {
      console.error('Error bootstrapping rate limiter config:', error);
    })
    .finally(() => {
      state.inFlight = null;
      bootstrapState.set(id, state);
    });

  state.inFlight = p;
  bootstrapState.set(id, state);
  return p;
}

function baseDefaults() {
  return {
    enabled: false,
    mode: 'reportOnly',
    algorithm: 'fixedWindow',
    limit: { max: 60, windowMs: 60000 },
    identity: { type: 'userIdOrIp' },
    metrics: { enabled: true, bucketMs: 60000, retentionDays: 14 },
    store: { ttlBufferMs: 60000, failOpen: true },
  };
}

function resolveEffectiveConfig({ registryConfig, globalDefaults, limiterOverride }) {
  const merged = deepMerge(deepMerge(deepMerge(baseDefaults(), registryConfig || {}), globalDefaults || {}), limiterOverride || {});

  if (merged.limit) {
    merged.limit.max = Math.max(0, Number(merged.limit.max || 0) || 0);
    merged.limit.windowMs = Math.max(1, Number(merged.limit.windowMs || 1) || 1);
  }

  if (merged.metrics) {
    merged.metrics.bucketMs = Math.max(1000, Number(merged.metrics.bucketMs || 60000) || 60000);
    merged.metrics.retentionDays = Math.max(1, Number(merged.metrics.retentionDays || 14) || 14);
  }

  if (!merged.store) merged.store = {};
  merged.store.ttlBufferMs = Math.max(0, Number(merged.store.ttlBufferMs || 0) || 0);
  merged.store.failOpen = merged.store.failOpen !== false;

  if (!merged.identity) merged.identity = { type: 'userIdOrIp' };

  return merged;
}

function computeIdentityKey(identityCfg, { req, identity } = {}) {
  const cfg = identityCfg || { type: 'userIdOrIp' };
  const id = identity && typeof identity === 'object' ? identity : {};

  const userId = id.userId || tryExtractUserIdFromBearer(req);
  const ip = id.ip || getClientIp(req);
  const orgId = id.orgId || (req.org?._id ? String(req.org._id) : null);

  if (id.identityKey) return String(id.identityKey);

  const type = String(cfg.type || 'userIdOrIp');

  if (type === 'userId') return userId ? `user:${userId}` : `ip:${ip}`;
  if (type === 'ip') return `ip:${ip}`;
  if (type === 'orgId') return orgId ? `org:${orgId}` : (userId ? `user:${userId}` : `ip:${ip}`);

  if (type === 'header') {
    const headerName = String(cfg.headerName || '').toLowerCase();
    const headerValue = headerName ? req.get(headerName) : null;
    if (headerValue) return `header:${headerName}:${String(headerValue)}`;
    return userId ? `user:${userId}` : `ip:${ip}`;
  }

  return userId ? `user:${userId}` : `ip:${ip}`;
}

function computeWindowStart(now, windowMs) {
  const ms = Number(windowMs || 60000) || 60000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

async function recordMetrics({ limiterId, bucketStart, allowed, blocked, checked, retentionDays }) {
  const ttlDays = Math.max(1, Number(retentionDays || 14) || 14);
  const expiresAt = new Date(bucketStart.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  await RateLimitMetricBucket.findOneAndUpdate(
    { limiterId, bucketStart },
    {
      $inc: {
        checked: checked ? 1 : 0,
        allowed: allowed ? 1 : 0,
        blocked: blocked ? 1 : 0,
      },
      $setOnInsert: { expiresAt },
    },
    { upsert: true },
  );
}

async function check(limiterId, { req, identity } = {}) {
  const id = normalizeLimiterId(limiterId);
  registerLimiter(id);

  ensureLimiterOverrideExists(id);

  const failOpen = true;

  if (mongoose.connection.readyState !== 1) {
    if (failOpen) {
      return {
        ok: false,
        limiterId: String(id),
        allowed: true,
        enforced: false,
        reason: 'DB_NOT_CONNECTED',
      };
    }
    return {
      ok: false,
      limiterId: String(id),
      allowed: false,
      enforced: true,
      reason: 'DB_NOT_CONNECTED',
    };
  }

  let configDoc;
  let configData;
  try {
    const cfg = await getRateLimitsConfigData();
    configDoc = cfg.doc;
    configData = cfg.data;
  } catch (e) {
    if (failOpen) {
      return {
        ok: false,
        limiterId: String(id),
        allowed: true,
        enforced: false,
        reason: 'CONFIG_ERROR',
        error: e.message,
      };
    }
    return {
      ok: false,
      limiterId: String(id),
      allowed: false,
      enforced: true,
      reason: 'CONFIG_ERROR',
      error: e.message,
    };
  }

  const globalDefaults = configData?.defaults || {};
  const hasOverride = configData?.limiters && Object.prototype.hasOwnProperty.call(configData.limiters, String(id));
  const limiterOverrideRaw = hasOverride ? configData.limiters[String(id)] : null;
  const limiterOverride = limiterOverrideRaw && typeof limiterOverrideRaw === 'object' && !Array.isArray(limiterOverrideRaw)
    ? limiterOverrideRaw
    : { enabled: false };

  const effective = resolveEffectiveConfig({
    registryConfig: {},
    globalDefaults,
    limiterOverride,
  });

  const enabled = effective.enabled !== false;
  const mode = String(effective.mode || 'reportOnly');

  if (!enabled || mode === 'disabled') {
    return {
      ok: true,
      limiterId: String(id),
      allowed: true,
      enforced: false,
      reason: 'DISABLED',
      config: effective,
      configDoc: configDoc?._id ? String(configDoc._id) : null,
    };
  }

  const effectiveFailOpen = effective.store?.failOpen !== false;

  const now = new Date();
  const max = Number(effective.limit?.max || 0) || 0;
  const windowMs = Number(effective.limit?.windowMs || 60000) || 60000;
  const windowStart = computeWindowStart(now, windowMs);
  const ttlBufferMs = Number(effective.store?.ttlBufferMs || 0) || 0;

  const identityKey = computeIdentityKey(effective.identity, { req, identity });

  let count;
  try {
    const expiresAt = new Date(windowStart.getTime() + windowMs + ttlBufferMs);
    const updated = await RateLimitCounter.findOneAndUpdate(
      { limiterId: String(limiterId), identityKey: String(identityKey), windowStart },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt },
      },
      { upsert: true, new: true },
    );

    count = Number(updated?.count || 0) || 0;
  } catch (e) {
    if (effectiveFailOpen) {
      return {
        ok: false,
        limiterId: String(id),
        allowed: true,
        enforced: false,
        reason: 'STORE_ERROR',
        error: e.message,
        config: effective,
      };
    }

    return {
      ok: false,
      limiterId: String(id),
      allowed: false,
      enforced: true,
      reason: 'STORE_ERROR',
      error: e.message,
      config: effective,
    };
  }

  const allowed = max <= 0 ? true : count <= max;
  const enforced = mode === 'enforce';

  if (effective.metrics?.enabled !== false) {
    const bucketMs = Number(effective.metrics?.bucketMs || 60000) || 60000;
    const bucketStart = new Date(Math.floor(now.getTime() / bucketMs) * bucketMs);
    try {
      await recordMetrics({
        limiterId: String(id),
        bucketStart,
        allowed,
        blocked: !allowed,
        checked: true,
        retentionDays: effective.metrics?.retentionDays,
      });
    } catch (_) {
    }
  }

  const remaining = max <= 0 ? null : Math.max(0, max - count);
  const retryAfterMs = allowed ? 0 : Math.max(0, windowStart.getTime() + windowMs - now.getTime());

  return {
    ok: true,
    limiterId: String(id),
    allowed: enforced ? allowed : true,
    enforced,
    mode,
    limit: max,
    remaining,
    retryAfterMs,
    windowStart: windowStart.toISOString(),
    windowMs,
    identityKey,
    config: effective,
  };
}

function limit(limiterId, opts = {}) {
  const getIdentity = typeof opts.getIdentity === 'function' ? opts.getIdentity : null;
  const label = opts && typeof opts === 'object' ? opts.label : null;
  const integration = opts && typeof opts === 'object' ? opts.integration : null;

  const id = normalizeLimiterId(limiterId);
  registerLimiter(id, { label, integration });
  ensureLimiterOverrideExists(id);

  let bootstrapAttemptedInRequest = false;

  return async (req, res, next) => {
    try {
      if (!bootstrapAttemptedInRequest) {
        bootstrapAttemptedInRequest = true;
        const inferredMountPath = req?.baseUrl || req?.path || null;
        registerLimiter(id, { inferredMountPath });
        await ensureLimiterOverrideExists(id);
      }

      const identity = getIdentity ? getIdentity(req) : null;
      const result = await check(id, { req, identity });

      if (typeof result.limit === 'number') {
        res.setHeader('X-RateLimit-Limit', String(result.limit));
      }
      if (result.remaining !== null && result.remaining !== undefined) {
        res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      }
      if (result.retryAfterMs && result.retryAfterMs > 0) {
        res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      }
      if (result.mode) {
        res.setHeader('X-RateLimit-Mode', String(result.mode));
      }

      if (!result.allowed) {
        return res.status(429).json({ error: 'Too many requests' });
      }

      return next();
    } catch (e) {
      return next(e);
    }
  };
}

async function list() {
  const { data } = await getRateLimitsConfigData();
  const globalDefaults = data?.defaults || {};
  const limiters = data?.limiters || {};

  const ids = new Set([...Array.from(registry.keys()), ...Object.keys(limiters)]);

  const items = [];
  for (const id of ids) {
    const entry = registry.get(id) || { id, label: id, integration: null };
    const hasOverride = Object.prototype.hasOwnProperty.call(limiters, id);
    const overrideRaw = hasOverride ? limiters[id] : null;
    const override = overrideRaw && typeof overrideRaw === 'object' && !Array.isArray(overrideRaw) ? overrideRaw : (hasOverride ? {} : null);
    const effectiveOverride = override || { enabled: false };
    const effective = resolveEffectiveConfig({ registryConfig: {}, globalDefaults, limiterOverride: effectiveOverride });
    items.push({
      id,
      label: entry.label,
      integration: entry.integration,
      registryConfig: {},
      override,
      effective,
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

async function bulkSetEnabled({ enabled, ids, all } = {}) {
  const { doc, data } = await getRateLimitsConfigData();
  const limiters = { ...(data?.limiters || {}) };

  const targetIds = all
    ? Array.from(new Set([...Object.keys(limiters), ...Array.from(registry.keys())]))
    : (Array.isArray(ids) ? ids.map((x) => String(x)) : []);

  for (const rawId of targetIds) {
    const id = normalizeLimiterId(rawId);
    const current = limiters[id] && typeof limiters[id] === 'object' && !Array.isArray(limiters[id]) ? limiters[id] : {};
    limiters[id] = { ...current, enabled: Boolean(enabled) };
  }

  const updated = {
    version: Number(data?.version || 1) || 1,
    defaults: data?.defaults || {},
    limiters,
  };

  doc.jsonRaw = JSON.stringify(updated, null, 2);
  doc.jsonHash = sha256(doc.jsonRaw);
  await doc.save();
  clearJsonConfigCache(RATE_LIMITS_KEY);

  return updated;
}

async function setLimiterOverride(limiterId, override) {
  const { doc, data } = await getRateLimitsConfigData();
  const id = String(limiterId);
  const next = typeof override === 'object' && override ? override : {};

  const updated = {
    version: Number(data?.version || 1) || 1,
    defaults: data?.defaults || {},
    limiters: { ...(data?.limiters || {}), [id]: next },
  };

  doc.jsonRaw = JSON.stringify(updated, null, 2);
  doc.jsonHash = sha256(doc.jsonRaw);
  await doc.save();
  clearJsonConfigCache(RATE_LIMITS_KEY);

  return updated;
}

async function resetLimiterOverride(limiterId) {
  const { doc, data } = await getRateLimitsConfigData();
  const id = String(limiterId);
  const limiters = { ...(data?.limiters || {}) };
  limiters[id] = { enabled: false };

  const updated = {
    version: Number(data?.version || 1) || 1,
    defaults: data?.defaults || {},
    limiters,
  };

  doc.jsonRaw = JSON.stringify(updated, null, 2);
  doc.jsonHash = sha256(doc.jsonRaw);
  await doc.save();
  clearJsonConfigCache(RATE_LIMITS_KEY);

  return updated;
}

async function updateRawConfig({ jsonRaw }) {
  const { doc } = await getRateLimitsConfigData();
  parseJsonOrThrow(jsonRaw);
  doc.jsonRaw = String(jsonRaw);
  doc.jsonHash = sha256(doc.jsonRaw);
  await doc.save();
  clearJsonConfigCache(RATE_LIMITS_KEY);
  return doc.toObject();
}

async function queryMetrics({ start, end } = {}) {
  const endDate = end ? new Date(end) : new Date();
  const startDate = start ? new Date(start) : new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

  const items = await RateLimitMetricBucket.find({
    bucketStart: { $gte: startDate, $lte: endDate },
  }).lean();

  const totals = {};
  for (const row of items) {
    const id = String(row.limiterId);
    if (!totals[id]) totals[id] = { checked: 0, allowed: 0, blocked: 0 };
    totals[id].checked += Number(row.checked || 0) || 0;
    totals[id].allowed += Number(row.allowed || 0) || 0;
    totals[id].blocked += Number(row.blocked || 0) || 0;
  }

  return {
    range: { start: startDate.toISOString(), end: endDate.toISOString() },
    totals,
    buckets: items,
  };
}

module.exports = {
  limit,
  check,
  list,
  getRateLimitsConfigDoc,
  getRateLimitsConfigData,
  updateRawConfig,
  setLimiterOverride,
  resetLimiterOverride,
  bulkSetEnabled,
  queryMetrics,
};
