const crypto = require('crypto');
const mongoose = require('mongoose');

const cacheLayer = require('./cacheLayer.service');
const globalSettingsService = require('./globalSettings.service');

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex');
}

function parseDurationToMs(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;

  const s = String(input).trim().toLowerCase();
  if (!s) return null;

  const m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(ms|s|m)$/);
  if (!m) return null;

  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n)) return null;

  if (unit === 'ms') return Math.round(n);
  if (unit === 's') return Math.round(n * 1000);
  if (unit === 'm') return Math.round(n * 60 * 1000);
  return null;
}

async function getDefaultTimeoutMs() {
  const fromSetting = await globalSettingsService.getSettingValue('PAGES_CONTEXT_BLOCK_TIMEOUT', null).catch(() => null);
  const fromEnv = process.env.PAGES_CONTEXT_BLOCK_TIMEOUT;
  const v = fromSetting !== null && fromSetting !== undefined ? fromSetting : (fromEnv !== undefined ? fromEnv : '30s');
  const ms = parseDurationToMs(v);
  return ms === null ? 30_000 : ms;
}

function getByPath(obj, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolateCtx(value, ctxRoot) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((v) => interpolateCtx(v, ctxRoot));
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$ctx') {
      return getByPath(ctxRoot, value.$ctx);
    }

    const out = {};
    for (const k of keys) {
      out[k] = interpolateCtx(value[k], ctxRoot);
    }
    return out;
  }

  return value;
}

function buildHelpers() {
  const sb = globalThis.superbackend || globalThis.saasbackend || null;
  const services = (sb && sb.services) ? sb.services : {};
  const models = (sb && sb.models) ? sb.models : {};

  const denyServices = new Set([
    'globalSettings',
    'migration',
    'workflow',
  ]);

  const safeServices = {};
  for (const [k, v] of Object.entries(services || {})) {
    if (denyServices.has(k)) continue;
    safeServices[k] = v;
  }

  return {
    services: safeServices,
    models,
    mongoose,
  };
}

function buildAuthContext(req) {
  const user = req?.user ? req.user : null;
  if (!user) return null;
  return {
    userId: user._id ? String(user._id) : null,
    role: user.role || null,
  };
}

function buildSessionContext(req) {
  const session = req?.session || null;
  if (!session || typeof session !== 'object') return null;

  const safe = {};
  for (const [k, v] of Object.entries(session)) {
    if (k.toLowerCase().includes('token')) continue;
    if (k.toLowerCase().includes('secret')) continue;
    safe[k] = v;
  }
  return safe;
}

async function withOptionalTimeout(promise, { enabled, timeoutMs }) {
  if (!enabled) return promise;

  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return promise;

  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => {
      const err = new Error('Context block timed out');
      err.code = 'TIMEOUT';
      reject(err);
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function runDbQueryBlock(block, pageContext) {
  const props = block?.props || {};

  const modelName = String(props.model || '').trim();
  if (!modelName) throw Object.assign(new Error('db.query requires props.model'), { code: 'VALIDATION' });

  const op = String(props.op || (props.mode === 'one' ? 'findOne' : 'find')).trim();
  const assignTo = String(props.assignTo || '').trim();
  if (!assignTo) throw Object.assign(new Error('db.query requires props.assignTo'), { code: 'VALIDATION' });

  const Model = mongoose.models[modelName] || (mongoose.modelNames().includes(modelName) ? mongoose.model(modelName) : null);
  if (!Model) throw Object.assign(new Error(`Unknown model: ${modelName}`), { code: 'VALIDATION' });

  const ctxRoot = {
    pageContext,
    auth: pageContext.auth,
    session: pageContext.session,
    vars: pageContext.vars,
    params: pageContext.params,
    query: pageContext.query,
  };

  const filter = interpolateCtx(props.filter || {}, ctxRoot);
  const sort = interpolateCtx(props.sort || undefined, ctxRoot);
  const select = interpolateCtx(props.select || undefined, ctxRoot);
  const limit = interpolateCtx(props.limit || undefined, ctxRoot);

  let q;
  if (op === 'findOne') {
    q = Model.findOne(filter);
  } else if (op === 'find') {
    q = Model.find(filter);
  } else if (op === 'countDocuments') {
    q = Model.countDocuments(filter);
  } else {
    throw Object.assign(new Error(`Unsupported db.query op: ${op}`), { code: 'VALIDATION' });
  }

  if (select !== undefined && select !== null && typeof q.select === 'function') {
    q = q.select(select);
  }

  if (sort && typeof q.sort === 'function') {
    q = q.sort(sort);
  }

  if (op === 'find' && limit !== undefined && limit !== null && typeof q.limit === 'function') {
    const n = parseInt(String(limit), 10);
    if (Number.isFinite(n) && n > 0) q = q.limit(n);
  }

  if (typeof q.lean === 'function') q = q.lean();

  const result = await q;
  pageContext.vars[assignTo] = result;
  return result;
}

async function runServiceInvokeBlock(block, pageContext) {
  const props = block?.props || {};

  const servicePath = String(props.servicePath || '').trim();
  if (!servicePath) throw Object.assign(new Error('service.invoke requires props.servicePath'), { code: 'VALIDATION' });

  const assignTo = String(props.assignTo || '').trim();
  if (!assignTo) throw Object.assign(new Error('service.invoke requires props.assignTo'), { code: 'VALIDATION' });

  const ctxRoot = {
    pageContext,
    auth: pageContext.auth,
    session: pageContext.session,
    vars: pageContext.vars,
    params: pageContext.params,
    query: pageContext.query,
  };

  const args = interpolateCtx(props.args || [], ctxRoot);

  const fn = getByPath(pageContext.helpers, servicePath);
  if (typeof fn !== 'function') {
    throw Object.assign(new Error(`service.invoke target is not a function: ${servicePath}`), { code: 'VALIDATION' });
  }

  const result = await fn(...(Array.isArray(args) ? args : [args]));
  pageContext.vars[assignTo] = result;
  return result;
}

function defaultCacheKeyForBlock({ pageId, routePath, block }) {
  return sha1(JSON.stringify({ pageId, routePath, block }));
}

async function runContextBlock(block, { pageId, routePath, pageContext }) {
  const type = String(block?.type || '').trim();

  const cache = block?.props?.cache || null;
  const cacheEnabled = Boolean(cache?.enabled);
  const namespace = cache?.namespace ? String(cache.namespace) : 'pages:ssr';
  const ttlSeconds = cache?.ttlSeconds === undefined ? undefined : cache.ttlSeconds;

  const timeoutEnabled = Boolean(block?.props?.timeout?.enabled);
  const timeoutMsRaw = block?.props?.timeout?.ms || block?.props?.timeout?.value || null;
  const defaultTimeoutMs = await getDefaultTimeoutMs();
  const timeoutMs = parseDurationToMs(timeoutMsRaw) ?? defaultTimeoutMs;

  const compute = async () => {
    if (type === 'context.db_query') {
      return runDbQueryBlock(block, pageContext);
    }
    if (type === 'context.service_invoke') {
      return runServiceInvokeBlock(block, pageContext);
    }
    throw Object.assign(new Error(`Unknown context block type: ${type}`), { code: 'VALIDATION' });
  };

  const run = async () => withOptionalTimeout(compute(), { enabled: timeoutEnabled, timeoutMs });

  if (!cacheEnabled) {
    return run();
  }

  const key = cache?.key
    ? String(interpolateCtx(cache.key, { pageContext, vars: pageContext.vars, params: pageContext.params, query: pageContext.query, auth: pageContext.auth, session: pageContext.session }))
    : defaultCacheKeyForBlock({ pageId, routePath, block });

  const cached = await cacheLayer.get(key, { namespace }).catch(() => null);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  const value = await run();
  await cacheLayer.set(key, value, { namespace, ttlSeconds }).catch(() => {});
  return value;
}

function splitBlocks(page) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  const contextBlocks = [];
  const renderBlocks = [];

  for (const b of blocks) {
    const t = String(b?.type || '').trim();
    if (t.startsWith('context.')) {
      contextBlocks.push(b);
    } else {
      renderBlocks.push(b);
    }
  }

  return { contextBlocks, renderBlocks };
}

async function resolvePageContext({ page, req, res, routePath, params = {}, mockContext = null }) {
  const pageContext = {
    vars: {},
    helpers: buildHelpers(),
    auth: buildAuthContext(req),
    session: buildSessionContext(req),
    params: params || {},
    query: (req && req.query) ? req.query : {},
    request: {
      path: routePath || (req ? req.path : null),
      method: req ? req.method : null,
    },
  };

  if (mockContext && typeof mockContext === 'object') {
    if (mockContext.auth !== undefined) pageContext.auth = mockContext.auth;
    if (mockContext.session !== undefined) pageContext.session = mockContext.session;
    if (mockContext.params !== undefined) pageContext.params = mockContext.params;
    if (mockContext.query !== undefined) pageContext.query = mockContext.query;
  }

  const { contextBlocks, renderBlocks } = splitBlocks(page);

  for (const block of contextBlocks) {
    await runContextBlock(block, {
      pageId: page?._id ? String(page._id) : null,
      routePath: routePath || (req ? req.path : null),
      pageContext,
    });
  }

  return { pageContext, contextBlocks, renderBlocks };
}

module.exports = {
  parseDurationToMs,
  getDefaultTimeoutMs,
  interpolateCtx,
  resolvePageContext,
};
