const crypto = require('crypto');
const axios = require('axios');
const { VM } = require('vm2');

const ProxyEntry = require('../models/ProxyEntry');
const cacheLayer = require('./cacheLayer.service');
const rateLimiter = require('./rateLimiter.service');
const { logAuditSync } = require('./auditLogger');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function safeJsonParse(bufOrString) {
  try {
    if (Buffer.isBuffer(bufOrString)) {
      return JSON.parse(bufOrString.toString('utf8'));
    }
    return JSON.parse(String(bufOrString || ''));
  } catch {
    return null;
  }
}

function normalizeForAudit(value, depth = 0) {
  if (depth > 6) return null;
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return {
      __arrayLength: value.length,
      items: value.length > 0 ? [normalizeForAudit(value[0], depth + 1)] : [],
    };
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = normalizeForAudit(v, depth + 1);
  }
  return out;
}

function stripHopByHopHeaders(headers) {
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
  ]);

  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const key = String(k).toLowerCase();
    if (hopByHop.has(key)) continue;
    if (v === undefined) continue;
    out[key] = v;
  }
  return out;
}

function applyHeaderPolicy(entry, incoming) {
  const cfg = entry?.headers || {};
  const allowList = Array.isArray(cfg.allowList) ? cfg.allowList.map((h) => String(h).toLowerCase()) : [];
  const denyList = Array.isArray(cfg.denyList) ? cfg.denyList.map((h) => String(h).toLowerCase()) : [];

  const out = {};
  const base = stripHopByHopHeaders(incoming);

  for (const [k, v] of Object.entries(base)) {
    const key = String(k).toLowerCase();

    if (key === 'authorization' && cfg.forwardAuthorization === false) continue;
    if (key === 'cookie' && cfg.forwardCookie === false) continue;

    if (denyList.includes(key)) continue;
    if (allowList.length > 0 && !allowList.includes(key)) continue;

    out[key] = v;
  }

  return out;
}

function matchValueForRule(rule, { targetUrl, host, path }) {
  const applyTo = String(rule.applyTo || 'targetUrl');
  if (applyTo === 'host') return host;
  if (applyTo === 'path') return path;
  return targetUrl;
}

function ruleMatches(rule, ctx) {
  if (!rule || rule.enabled === false) return false;
  const type = String(rule.type || '').toLowerCase();
  const value = String(rule.value || '');
  const input = String(matchValueForRule(rule, ctx) || '');

  if (type === 'contains') {
    return input.toLowerCase().includes(value.toLowerCase());
  }
  if (type === 'regexp') {
    try {
      const flags = String(rule.flags || 'i');
      const re = new RegExp(value, flags);
      return re.test(input);
    } catch {
      return false;
    }
  }
  return false;
}

function entryMatches(entry, ctx) {
  const match = entry?.match || {};
  const type = String(match.type || 'contains').toLowerCase();
  const value = String(match.value || '');
  const applyTo = String(match.applyTo || 'host');

  const input = applyTo === 'path'
    ? String(ctx.path || '')
    : (applyTo === 'targetUrl' ? String(ctx.targetUrl || '') : String(ctx.host || ''));

  if (!value) return false;

  if (type === 'exact') {
    return input.toLowerCase() === value.toLowerCase();
  }
  if (type === 'contains') {
    return input.toLowerCase().includes(value.toLowerCase());
  }
  if (type === 'regexp') {
    try {
      const flags = String(match.flags || 'i');
      const re = new RegExp(value, flags);
      return re.test(input);
    } catch {
      return false;
    }
  }

  return false;
}

function compareEntriesSpecificity(a, b) {
  const order = { exact: 3, contains: 2, regexp: 1 };
  const ta = String(a?.match?.type || 'contains').toLowerCase();
  const tb = String(b?.match?.type || 'contains').toLowerCase();
  const oa = order[ta] || 0;
  const ob = order[tb] || 0;
  if (oa !== ob) return ob - oa;

  const va = String(a?.match?.value || '');
  const vb = String(b?.match?.value || '');
  return vb.length - va.length;
}

async function upsertDiscovery({ targetUrl, host, path }) {
  const ns = 'proxy:discoveries';
  const key = sha256(`${host}|${path}|${targetUrl}`);

  const existing = await cacheLayer.get(key, { namespace: ns }).catch(() => null);
  const next = existing && typeof existing === 'object'
    ? { ...existing }
    : {
      key,
      targetUrl,
      host,
      path,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      count: 0,
    };

  next.lastSeenAt = new Date().toISOString();
  next.count = Number(next.count || 0) + 1;

  await cacheLayer.set(key, next, { namespace: ns, ttlSeconds: 24 * 60 * 60 }).catch(() => {});
  return next;
}

async function listDiscoveries() {
  const ns = 'proxy:discoveries';
  const keys = await cacheLayer.listKeys({ namespace: ns }).catch(() => null);

  const items = [];
  const list = Array.isArray(keys)
    ? keys
    : [
      ...((keys && Array.isArray(keys.memory)) ? keys.memory : []),
      ...((keys && Array.isArray(keys.mongo)) ? keys.mongo : []),
    ];

  for (const k of list) {
    const key = String(k?.key || '');
    if (!key) continue;
    // eslint-disable-next-line no-await-in-loop
    const val = await cacheLayer.get(key, { namespace: ns, rehydrate: false }).catch(() => null);
    if (!val || typeof val !== 'object') continue;
    items.push(val);
  }

  items.sort((a, b) => {
    const ta = new Date(a.lastSeenAt || 0).getTime();
    const tb = new Date(b.lastSeenAt || 0).getTime();
    return tb - ta;
  });

  return items;
}

async function findMatchingEntry(ctx) {
  const entries = await ProxyEntry.find({}).lean();
  const matched = (entries || []).filter((e) => entryMatches(e, ctx));
  matched.sort(compareEntriesSpecificity);
  return matched[0] || null;
}

function evaluatePolicy(entry, ctx) {
  const mode = String(entry?.policy?.mode || 'whitelist');
  const rules = Array.isArray(entry?.policy?.rules) ? entry.policy.rules : [];

  if (mode === 'allowAll') return { allowed: true, reason: 'ALLOW_ALL' };
  if (mode === 'denyAll') return { allowed: false, reason: 'DENY_ALL' };

  const anyMatch = rules.some((r) => ruleMatches(r, ctx));

  if (mode === 'blacklist') {
    return anyMatch ? { allowed: false, reason: 'BLACKLIST_MATCH' } : { allowed: true, reason: 'BLACKLIST_DEFAULT_ALLOW' };
  }

  // whitelist (default)
  return anyMatch ? { allowed: true, reason: 'WHITELIST_MATCH' } : { allowed: false, reason: 'WHITELIST_DEFAULT_DENY' };
}

function computeCacheKey(entry, { method, targetUrl, query, body, headers }) {
  const keyParts = entry?.cache?.keyParts || {};
  const headerAllow = Array.isArray(entry?.cache?.keyHeaderAllowList)
    ? entry.cache.keyHeaderAllowList.map((h) => String(h).toLowerCase())
    : [];

  const parts = [];

  if (keyParts.url !== false) {
    parts.push(`u:${targetUrl}`);
  }
  if (keyParts.query !== false && query && typeof query === 'object') {
    try {
      parts.push(`q:${JSON.stringify(query)}`);
    } catch {
    }
  }

  if (keyParts.bodyHash !== false) {
    const buf = body && Buffer.isBuffer(body) ? body : Buffer.from('');
    const bh = sha256(buf);
    parts.push(`b:${bh}`);
  }

  if (keyParts.headersHash !== false) {
    const subset = {};
    const src = headers && typeof headers === 'object' ? headers : {};
    if (headerAllow.length > 0) {
      for (const h of headerAllow) {
        if (src[h] !== undefined) subset[h] = src[h];
      }
    }
    const hh = sha256(JSON.stringify(subset));
    parts.push(`h:${hh}`);
  }

  parts.push(`m:${String(method || '').toUpperCase()}`);

  return sha256(parts.join('|'));
}

function runTransform(entry, ctx) {
  const cfg = entry?.transform || {};
  if (!cfg.enabled) return null;

  const timeoutMs = Math.max(1, Number(cfg.timeoutMs || 200) || 200);
  const code = String(cfg.code || '');
  if (!code.trim()) return null;

  const vm = new VM({ timeout: timeoutMs, sandbox: {} });

  const fn = vm.run(`(function(){\n${code}\n;\nreturn (typeof transform === 'function') ? transform : null;\n})()`);
  if (typeof fn !== 'function') {
    return { error: 'Transform code did not export a function named transform(ctx)' };
  }

  const out = fn(ctx);
  if (!out || typeof out !== 'object') return {};
  return out;
}

async function proxyRequest(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const targetUrl = String(req.proxyTargetUrl || '').trim();

  if (!targetUrl) {
    return { status: 400, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'Missing target URL' })) };
  }

  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    return { status: 400, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'Invalid target URL' })) };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { status: 400, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'Only http/https are supported' })) };
  }

  const ctx = {
    targetUrl: url.toString(),
    host: url.host,
    path: url.pathname,
  };

  const entry = await findMatchingEntry(ctx);
  if (!entry || entry.enabled !== true) {
    await upsertDiscovery(ctx).catch(() => {});
    logAuditSync({
      req,
      action: 'proxy.blocked',
      outcome: 'failure',
      targetType: 'ProxyRequest',
      targetId: ctx.targetUrl,
      details: { reason: 'NO_ENABLED_ENTRY', targetUrl: ctx.targetUrl, host: ctx.host, path: ctx.path },
    });
    return { status: 403, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'Proxy request blocked' })) };
  }

  const decision = evaluatePolicy(entry, ctx);
  if (!decision.allowed) {
    logAuditSync({
      req,
      action: 'proxy.blocked',
      outcome: 'failure',
      targetType: 'ProxyRequest',
      targetId: ctx.targetUrl,
      details: { reason: decision.reason, targetUrl: ctx.targetUrl, host: ctx.host, path: ctx.path, entryId: String(entry._id) },
    });
    return { status: 403, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'Proxy request blocked' })) };
  }

  if (entry.rateLimit?.enabled) {
    const limiterId = String(entry.rateLimit?.limiterId || `proxy:${entry._id}`);
    const result = await rateLimiter.check(limiterId, { req });
    if (!result.allowed) {
      logAuditSync({
        req,
        action: 'proxy.rate_limited',
        outcome: 'failure',
        targetType: 'ProxyRequest',
        targetId: ctx.targetUrl,
        details: { limiterId, targetUrl: ctx.targetUrl, entryId: String(entry._id) },
      });
      return { status: 429, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'Too many requests' })) };
    }
  }

  const incomingHeaders = req.headers || {};
  const outgoingHeaders = applyHeaderPolicy(entry, incomingHeaders);

  const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

  const cacheCfg = entry.cache || {};
  const cacheEnabled = Boolean(cacheCfg.enabled);
  const allowedMethods = Array.isArray(cacheCfg.methods) ? cacheCfg.methods.map((m) => String(m).toUpperCase()) : ['GET', 'HEAD'];
  const cacheAllowedForMethod = cacheEnabled && allowedMethods.includes(method);

  const cacheNamespace = String(cacheCfg.namespace || 'proxy');

  if (cacheAllowedForMethod) {
    const cacheKey = computeCacheKey(entry, {
      method,
      targetUrl: ctx.targetUrl,
      query: Object.fromEntries(url.searchParams.entries()),
      body: bodyBuf,
      headers: outgoingHeaders,
    });

    const cached = await cacheLayer.get(cacheKey, { namespace: cacheNamespace }).catch(() => null);
    if (cached && typeof cached === 'object' && cached.bodyBase64) {
      logAuditSync({
        req,
        action: 'proxy.cache.hit',
        outcome: 'success',
        targetType: 'ProxyRequest',
        targetId: ctx.targetUrl,
        details: { cacheKey, namespace: cacheNamespace, entryId: String(entry._id) },
      });

      const resBody = Buffer.from(String(cached.bodyBase64), 'base64');
      const headers = cached.headers && typeof cached.headers === 'object' ? cached.headers : {};
      return { status: Number(cached.status || 200) || 200, headers, body: resBody };
    }

    logAuditSync({
      req,
      action: 'proxy.cache.miss',
      outcome: 'success',
      targetType: 'ProxyRequest',
      targetId: ctx.targetUrl,
      details: { cacheKey, namespace: cacheNamespace, entryId: String(entry._id) },
    });
  }

  const upstream = await axios({
    url: ctx.targetUrl,
    method,
    headers: outgoingHeaders,
    data: ['GET', 'HEAD'].includes(method) ? undefined : bodyBuf,
    responseType: 'arraybuffer',
    validateStatus: () => true,
    timeout: 30000,
    maxContentLength: 10 * 1024 * 1024,
    maxBodyLength: 10 * 1024 * 1024,
  });

  const responseHeaders = stripHopByHopHeaders(upstream.headers || {});
  const responseBody = Buffer.from(upstream.data || Buffer.from(''));

  const contentType = String(responseHeaders['content-type'] || '');
  const isJson = contentType.includes('application/json') || contentType.includes('+json');

  let transformed = null;
  if (entry.transform?.enabled) {
    const jsonBody = isJson ? safeJsonParse(responseBody) : null;

    transformed = runTransform(entry, {
      request: {
        method,
        targetUrl: ctx.targetUrl,
        headers: outgoingHeaders,
        bodyBase64: bodyBuf.length ? bodyBuf.toString('base64') : null,
      },
      response: {
        status: upstream.status,
        headers: responseHeaders,
        bodyBase64: responseBody.length ? responseBody.toString('base64') : null,
        json: jsonBody,
      },
    });
  }

  if (transformed && transformed.error) {
    logAuditSync({
      req,
      action: 'proxy.transform.error',
      outcome: 'failure',
      targetType: 'ProxyRequest',
      targetId: ctx.targetUrl,
      details: { error: transformed.error, entryId: String(entry._id) },
    });
  }

  let finalStatus = upstream.status;
  let finalHeaders = { ...responseHeaders };
  let finalBody = responseBody;

  if (transformed && typeof transformed === 'object') {
    if (transformed.status !== undefined) {
      finalStatus = Number(transformed.status) || finalStatus;
    }
    if (transformed.headers && typeof transformed.headers === 'object') {
      finalHeaders = stripHopByHopHeaders({ ...finalHeaders, ...transformed.headers });
    }
    if (transformed.bodyBase64) {
      finalBody = Buffer.from(String(transformed.bodyBase64), 'base64');
    } else if (transformed.bodyText !== undefined) {
      finalBody = Buffer.from(String(transformed.bodyText || ''), 'utf8');
    } else if (transformed.json !== undefined) {
      finalHeaders['content-type'] = 'application/json';
      finalBody = Buffer.from(JSON.stringify(transformed.json), 'utf8');
    }
  }

  if (cacheAllowedForMethod) {
    const cacheKey = computeCacheKey(entry, {
      method,
      targetUrl: ctx.targetUrl,
      query: Object.fromEntries(url.searchParams.entries()),
      body: bodyBuf,
      headers: outgoingHeaders,
    });

    if (finalStatus >= 200 && finalStatus < 300) {
      const toStore = {
        status: finalStatus,
        headers: finalHeaders,
        bodyBase64: finalBody.toString('base64'),
        storedAt: new Date().toISOString(),
      };
      await cacheLayer.set(cacheKey, toStore, { namespace: cacheNamespace, ttlSeconds: cacheCfg.ttlSeconds }).catch(() => {});
      logAuditSync({
        req,
        action: 'proxy.cache.store',
        outcome: 'success',
        targetType: 'ProxyRequest',
        targetId: ctx.targetUrl,
        details: { cacheKey, namespace: cacheNamespace, entryId: String(entry._id), status: finalStatus },
      });
    }
  }

  const normalizedBody = isJson ? normalizeForAudit(safeJsonParse(finalBody)) : null;
  logAuditSync({
    req,
    action: 'proxy.response',
    outcome: finalStatus >= 400 ? 'failure' : 'success',
    targetType: 'ProxyRequest',
    targetId: ctx.targetUrl,
    details: {
      entryId: String(entry._id),
      targetUrl: ctx.targetUrl,
      status: finalStatus,
      normalizedBody,
    },
  });

  return { status: finalStatus, headers: finalHeaders, body: finalBody };
}

module.exports = {
  proxyRequest,
  listDiscoveries,
};
