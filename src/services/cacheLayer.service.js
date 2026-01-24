const CacheEntry = require('../models/CacheEntry');
const { getSettingValue } = require('./globalSettings.service');

function now() {
  return Date.now();
}

function safeJsonParse(str) {
  try {
    return JSON.parse(String(str));
  } catch {
    return null;
  }
}

function toInt(val, fallback) {
  const n = parseInt(String(val), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(val, fallback) {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase().trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return fallback;
}

function estimateBytes(str) {
  return Buffer.byteLength(String(str || ''), 'utf8');
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

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

function computeExpiresAt(ttlSeconds) {
  if (ttlSeconds === null) return null;
  if (ttlSeconds === undefined) return null;
  const n = Number(ttlSeconds);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return new Date(Date.now() + n * 1000);
}

function encodeValue(value, atRestFormat) {
  if (atRestFormat === 'base64') {
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }
    return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

function decodeValue(stored, atRestFormat) {
  const s = String(stored ?? '');

  if (atRestFormat === 'base64') {
    return Buffer.from(s, 'base64');
  }

  const parsed = safeJsonParse(s);
  return parsed === null ? s : parsed;
}

class MemoryStore {
  constructor() {
    this.map = new Map(); // key -> entry
    this.bytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.offloads = 0;
  }

  _touch(key, entry, evictionPolicy) {
    entry.lastAccessAt = new Date();
    entry.hits = (entry.hits || 0) + 1;

    if (evictionPolicy === 'lru') {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, entry);
    }

    if (evictionPolicy === 'lfu') {
      entry.freq = (entry.freq || 0) + 1;
    }
  }

  _candidateKey(evictionPolicy) {
    if (this.map.size === 0) return null;

    if (evictionPolicy === 'fifo') {
      return this.map.keys().next().value;
    }

    if (evictionPolicy === 'lru') {
      return this.map.keys().next().value;
    }

    if (evictionPolicy === 'lfu') {
      let selected = null;
      let selectedFreq = Infinity;
      let selectedTime = Infinity;

      for (const [k, e] of this.map.entries()) {
        const f = Number(e.freq || 0);
        const t = new Date(e.updatedAt || e.createdAt || 0).getTime();
        if (f < selectedFreq || (f === selectedFreq && t < selectedTime)) {
          selected = k;
          selectedFreq = f;
          selectedTime = t;
        }
      }

      return selected;
    }

    return this.map.keys().next().value;
  }

  set(compoundKey, entry, evictionPolicy) {
    const existing = this.map.get(compoundKey);
    if (existing) {
      this.bytes -= Number(existing.sizeBytes || 0);
    }

    this.map.set(compoundKey, entry);
    this.bytes += Number(entry.sizeBytes || 0);

    if (evictionPolicy === 'lru') {
      // ensure insertion order means most recently used at end
      this.map.delete(compoundKey);
      this.map.set(compoundKey, entry);
    }
  }

  get(compoundKey, evictionPolicy) {
    const entry = this.map.get(compoundKey);
    if (!entry) {
      this.misses += 1;
      return null;
    }

    if (isExpired(entry.expiresAt)) {
      this.delete(compoundKey);
      this.misses += 1;
      return null;
    }

    this.hits += 1;
    this._touch(compoundKey, entry, evictionPolicy);
    return entry;
  }

  delete(compoundKey) {
    const entry = this.map.get(compoundKey);
    if (!entry) return false;
    this.map.delete(compoundKey);
    this.bytes -= Number(entry.sizeBytes || 0);
    return true;
  }

  clear() {
    this.map.clear();
    this.bytes = 0;
  }

  listKeys({ prefix }) {
    const out = [];
    for (const k of this.map.keys()) {
      if (prefix && !String(k).startsWith(prefix)) continue;
      out.push(k);
    }
    return out;
  }

  stats() {
    return {
      entries: this.map.size,
      estimatedBytes: this.bytes,
      hits: this.hits,
      misses: this.misses,
      offloads: this.offloads,
    };
  }
}

class CacheLayerService {
  constructor() {
    this.memory = new MemoryStore();
    this._configCache = { value: null, ts: 0 };
  }

  async getConfig() {
    const cached = this._configCache;
    if (cached.value && Date.now() - cached.ts < 2000) {
      return cached.value;
    }

    const envBackend = process.env.CACHE_LAYER_BACKEND;
    const envRedisUrl = process.env.CACHE_LAYER_REDIS_URL;
    const envRedisPrefix = process.env.CACHE_LAYER_REDIS_PREFIX;
    const envThreshold = process.env.CACHE_LAYER_OFFLOAD_THRESHOLD_BYTES;
    const envMaxEntry = process.env.CACHE_LAYER_MAX_ENTRY_BYTES;
    const envDefaultTtl = process.env.CACHE_LAYER_DEFAULT_TTL_SECONDS;
    const envEviction = process.env.CACHE_LAYER_EVICTION_POLICY;
    const envAtRest = process.env.CACHE_LAYER_AT_REST_FORMAT;

    const backend = (envBackend || (await getSettingValue('CACHE_LAYER_BACKEND', 'memory')) || 'memory')
      .toString()
      .toLowerCase();

    const evictionPolicy = (envEviction || (await getSettingValue('CACHE_LAYER_EVICTION_POLICY', 'lru')) || 'lru')
      .toString()
      .toLowerCase();

    const redisUrl = envRedisUrl || (await getSettingValue('CACHE_LAYER_REDIS_URL', null));
    const redisPrefix = envRedisPrefix || (await getSettingValue('CACHE_LAYER_REDIS_PREFIX', 'superbackend:'));

    const offloadThresholdBytes = toInt(
      envThreshold || (await getSettingValue('CACHE_LAYER_OFFLOAD_THRESHOLD_BYTES', String(5 * 1024 * 1024))),
      5 * 1024 * 1024,
    );

    const maxEntryBytes = toInt(
      envMaxEntry || (await getSettingValue('CACHE_LAYER_MAX_ENTRY_BYTES', String(256 * 1024))),
      256 * 1024,
    );

    const defaultTtlSeconds = toInt(
      envDefaultTtl || (await getSettingValue('CACHE_LAYER_DEFAULT_TTL_SECONDS', String(10 * 60))),
      10 * 60,
    );

    const atRestFormat = (envAtRest || (await getSettingValue('CACHE_LAYER_AT_REST_FORMAT', 'string')) || 'string')
      .toString()
      .toLowerCase();

    const resolved = {
      backend: backend === 'redis' ? 'redis' : 'memory',
      evictionPolicy: ['fifo', 'lru', 'lfu'].includes(evictionPolicy) ? evictionPolicy : 'lru',
      redisUrl: redisUrl ? String(redisUrl) : null,
      redisPrefix: String(redisPrefix || 'superbackend:'),
      offloadThresholdBytes,
      maxEntryBytes,
      defaultTtlSeconds,
      atRestFormat: atRestFormat === 'base64' ? 'base64' : 'string',
    };

    this._configCache = { value: resolved, ts: Date.now() };
    return resolved;
  }

  _compoundKey(namespace, key) {
    return `${normalizeNamespace(namespace)}:${normalizeKey(key)}`;
  }

  async _ensureRedisClient(config) {
    if (!config.redisUrl) {
      throw Object.assign(new Error('Redis is enabled but CACHE_LAYER_REDIS_URL is not configured'), { code: 'VALIDATION' });
    }

    let redis;
    try {
      redis = require('redis');
    } catch {
      throw Object.assign(
        new Error('Redis backend requires the "redis" package. Please add it to dependencies.'),
        { code: 'VALIDATION' },
      );
    }

    if (this._redisClient && this._redisUrl === config.redisUrl) {
      return this._redisClient;
    }

    if (this._redisClient) {
      try {
        await this._redisClient.quit();
      } catch {
        // ignore
      }
    }

    const client = redis.createClient({ url: config.redisUrl });
    client.on('error', (err) => {
      try {
        console.log('[CacheLayer] Redis error:', err?.message || err);
      } catch {
        // ignore
      }
    });

    await client.connect();
    this._redisClient = client;
    this._redisUrl = config.redisUrl;
    return client;
  }

  async set(key, value, opts = {}) {
    const config = await this.getConfig();
    const namespace = normalizeNamespace(opts.namespace);
    const k = normalizeKey(key);

    const ttlSeconds =
      opts.ttlSeconds === undefined
        ? config.defaultTtlSeconds
        : opts.ttlSeconds;

    const allowNoExpiry = toBool(opts.allowNoExpiry, true);
    const expiresAt = ttlSeconds === null && allowNoExpiry ? null : computeExpiresAt(ttlSeconds);

    const atRestFormat = (opts.atRestFormat || config.atRestFormat) === 'base64' ? 'base64' : 'string';

    const encoded = encodeValue(value, atRestFormat);
    const sizeBytes = estimateBytes(encoded);
    if (sizeBytes > config.maxEntryBytes) {
      throw Object.assign(new Error('Value exceeds max entry size'), { code: 'VALIDATION' });
    }

    if (config.backend === 'redis') {
      const client = await this._ensureRedisClient(config);
      const redisKey = `${config.redisPrefix}${namespace}:${k}`;
      if (expiresAt) {
        const ttl = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
        await client.set(redisKey, encoded, { EX: ttl });
      } else {
        await client.set(redisKey, encoded);
      }
      return { ok: true };
    }

    const compound = this._compoundKey(namespace, k);
    const entry = {
      namespace,
      key: k,
      value: encoded,
      atRestFormat,
      sizeBytes,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      hits: 0,
      freq: 0,
      lastAccessAt: null,
      source: 'manual',
    };

    this.memory.set(compound, entry, config.evictionPolicy);
    await this._maybeOffload(config);
    return { ok: true };
  }

  async get(key, opts = {}) {
    const config = await this.getConfig();
    const namespace = normalizeNamespace(opts.namespace);
    const k = normalizeKey(key);

    if (config.backend === 'redis') {
      const client = await this._ensureRedisClient(config);
      const redisKey = `${config.redisPrefix}${namespace}:${k}`;
      const raw = await client.get(redisKey);
      if (raw === null || raw === undefined) return null;
      const atRestFormat = (opts.atRestFormat || config.atRestFormat) === 'base64' ? 'base64' : 'string';
      return decodeValue(raw, atRestFormat);
    }

    const compound = this._compoundKey(namespace, k);
    const entry = this.memory.get(compound, config.evictionPolicy);
    if (entry) {
      return decodeValue(entry.value, entry.atRestFormat || config.atRestFormat);
    }

    const mongo = await CacheEntry.findOne({ namespace, key: k }).lean();
    if (!mongo) {
      return null;
    }

    if (isExpired(mongo.expiresAt)) {
      await CacheEntry.deleteOne({ _id: mongo._id });
      return null;
    }

    await CacheEntry.updateOne(
      { _id: mongo._id },
      { $inc: { hits: 1 }, $set: { lastAccessAt: new Date() } },
    );

    if (toBool(opts.rehydrate, true)) {
      const compound2 = this._compoundKey(namespace, k);
      this.memory.set(
        compound2,
        {
          namespace,
          key: k,
          value: mongo.value,
          atRestFormat: mongo.atRestFormat || config.atRestFormat,
          sizeBytes: mongo.sizeBytes || estimateBytes(mongo.value),
          expiresAt: mongo.expiresAt || null,
          createdAt: mongo.createdAt || new Date(),
          updatedAt: new Date(),
          hits: mongo.hits || 0,
          freq: mongo.hits || 0,
          lastAccessAt: mongo.lastAccessAt || null,
          source: 'offloaded',
        },
        config.evictionPolicy,
      );
      await this._maybeOffload(config);
    }

    return decodeValue(mongo.value, mongo.atRestFormat || config.atRestFormat);
  }

  async delete(key, opts = {}) {
    const config = await this.getConfig();
    const namespace = normalizeNamespace(opts.namespace);
    const k = normalizeKey(key);

    if (config.backend === 'redis') {
      const client = await this._ensureRedisClient(config);
      const redisKey = `${config.redisPrefix}${namespace}:${k}`;
      const n = await client.del(redisKey);
      return { ok: n > 0 };
    }

    const compound = this._compoundKey(namespace, k);
    const mem = this.memory.delete(compound);
    const mongo = await CacheEntry.deleteOne({ namespace, key: k });
    return { ok: Boolean(mem || mongo?.deletedCount) };
  }

  async clear(opts = {}) {
    const config = await this.getConfig();
    const backend = String(opts.backend || 'all');
    const namespace = opts.namespace ? normalizeNamespace(opts.namespace) : null;
    const prefix = opts.prefix ? String(opts.prefix) : null;

    const cleared = { memory: 0, mongo: 0, redis: 0 };

    if (backend === 'memory' || backend === 'all') {
      if (!namespace && !prefix) {
        cleared.memory = this.memory.map.size;
        this.memory.clear();
      } else {
        const pfx = `${namespace || ''}${namespace ? ':' : ''}${prefix || ''}`;
        const keys = this.memory.listKeys({ prefix: pfx || null });
        for (const k of keys) {
          if (this.memory.delete(k)) cleared.memory += 1;
        }
      }
    }

    if (backend === 'mongo' || backend === 'all') {
      const filter = {};
      if (namespace) filter.namespace = namespace;
      if (prefix) filter.key = { $regex: `^${prefix}` };
      const res = await CacheEntry.deleteMany(filter);
      cleared.mongo = res.deletedCount || 0;
    }

    if (backend === 'redis' || backend === 'all') {
      const effectiveBackend = config.backend === 'redis' ? 'redis' : 'memory';
      if (effectiveBackend !== 'redis') {
        // redis not enabled but allow explicit clear attempt
        return { ok: true, cleared };
      }

      const client = await this._ensureRedisClient(config);
      const scanPrefix = `${config.redisPrefix}${namespace || ''}${namespace ? ':' : ''}${prefix || ''}`;

      let cursor = 0;
      do {
        // eslint-disable-next-line no-await-in-loop
        const result = await client.scan(cursor, { MATCH: `${scanPrefix}*`, COUNT: 200 });
        cursor = Number(result.cursor);
        const keys = result.keys || [];
        if (keys.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          const n = await client.del(keys);
          cleared.redis += Number(n || 0);
        }
      } while (cursor !== 0);
    }

    return { ok: true, cleared };
  }

  async listKeys(opts = {}) {
    const config = await this.getConfig();
    const namespace = opts.namespace ? normalizeNamespace(opts.namespace) : null;
    const prefix = opts.prefix ? String(opts.prefix) : null;

    if (config.backend === 'redis') {
      const client = await this._ensureRedisClient(config);
      const scanPrefix = `${config.redisPrefix}${namespace || ''}${namespace ? ':' : ''}${prefix || ''}`;

      const out = [];
      let cursor = 0;
      do {
        const result = await client.scan(cursor, { MATCH: `${scanPrefix}*`, COUNT: 200 });
        cursor = Number(result.cursor);
        const keys = result.keys || [];
        for (const fullKey of keys) {
          const full = String(fullKey);
          if (!full.startsWith(config.redisPrefix)) continue;
          const withoutPrefix = full.slice(config.redisPrefix.length);
          const idx = withoutPrefix.indexOf(':');
          const ns = idx >= 0 ? withoutPrefix.slice(0, idx) : 'default';
          const k = idx >= 0 ? withoutPrefix.slice(idx + 1) : withoutPrefix;
          out.push({
            namespace: ns,
            key: k,
            backend: 'redis',
          });
        }
      } while (cursor !== 0);

      return out;
    }

    const filter = {};
    if (namespace) filter.namespace = namespace;
    if (prefix) filter.key = { $regex: `^${prefix}` };

    const mongoKeys = await CacheEntry.find(filter).select('namespace key updatedAt expiresAt sizeBytes hits lastAccessAt atRestFormat source').sort({ updatedAt: -1 }).limit(500).lean();
    const memKeys = [];
    for (const compound of this.memory.map.keys()) {
      if (namespace && !String(compound).startsWith(`${namespace}:`)) continue;
      if (prefix && !String(compound).startsWith(`${namespace || 'default'}:${prefix}`)) continue;
      const entry = this.memory.map.get(compound);
      if (!entry) continue;
      memKeys.push({
        namespace: entry.namespace,
        key: entry.key,
        updatedAt: entry.updatedAt,
        expiresAt: entry.expiresAt,
        sizeBytes: entry.sizeBytes,
        hits: entry.hits,
        lastAccessAt: entry.lastAccessAt,
        atRestFormat: entry.atRestFormat,
        source: entry.source || 'manual',
        backend: 'memory',
      });
    }

    return {
      memory: memKeys,
      mongo: mongoKeys.map((e) => ({ ...e, backend: 'mongo' })),
    };
  }

  async getEntry(key, opts = {}) {
    const config = await this.getConfig();
    const namespace = normalizeNamespace(opts.namespace);
    const k = normalizeKey(key);

    if (config.backend === 'redis') {
      const client = await this._ensureRedisClient(config);
      const redisKey = `${config.redisPrefix}${namespace}:${k}`;
      const raw = await client.get(redisKey);
      if (raw === null || raw === undefined) return null;
      const atRestFormat = (opts.atRestFormat || config.atRestFormat) === 'base64' ? 'base64' : 'string';
      const decoded = decodeValue(raw, atRestFormat);
      return {
        namespace,
        key: k,
        backend: 'redis',
        atRestFormat,
        value: atRestFormat === 'base64' ? decoded.toString('base64') : raw,
        decoded: atRestFormat === 'base64' ? '[base64]' : decoded,
      };
    }

    const compound = this._compoundKey(namespace, k);
    const mem = this.memory.map.get(compound);
    if (mem && !isExpired(mem.expiresAt)) {
      return {
        ...mem,
        backend: 'memory',
        decoded: mem.atRestFormat === 'base64' ? '[base64]' : decodeValue(mem.value, mem.atRestFormat),
      };
    }

    const mongo = await CacheEntry.findOne({ namespace, key: k }).lean();
    if (!mongo) return null;
    if (isExpired(mongo.expiresAt)) {
      await CacheEntry.deleteOne({ _id: mongo._id });
      return null;
    }

    return {
      ...mongo,
      backend: 'mongo',
      decoded: mongo.atRestFormat === 'base64' ? '[base64]' : decodeValue(mongo.value, mongo.atRestFormat),
    };
  }

  async metrics() {
    const config = await this.getConfig();

    const memory = this.memory.stats();
    const mongoCount = await CacheEntry.countDocuments({});
    const mongoAgg = await CacheEntry.aggregate([
      { $group: { _id: null, bytes: { $sum: '$sizeBytes' } } },
    ]);

    const mongoBytes = Number(mongoAgg?.[0]?.bytes || 0);

    let redis = null;
    if (config.backend === 'redis') {
      try {
        const client = await this._ensureRedisClient(config);
        const info = await client.info('memory');
        const usedLine = String(info || '')
          .split('\n')
          .find((l) => l.startsWith('used_memory:'));
        const used = usedLine ? toInt(usedLine.split(':')[1], 0) : 0;
        redis = { usedMemoryBytes: used };
      } catch (err) {
        redis = { error: err?.message || 'Redis error' };
      }
    }

    return {
      backend: config.backend,
      evictionPolicy: config.evictionPolicy,
      defaultTtlSeconds: config.defaultTtlSeconds,
      offloadThresholdBytes: config.offloadThresholdBytes,
      maxEntryBytes: config.maxEntryBytes,
      atRestFormat: config.atRestFormat,
      memory,
      mongo: { entries: mongoCount, estimatedBytes: mongoBytes },
      redis,
    };
  }

  async _maybeOffload(config) {
    if (config.backend !== 'memory') return;
    if (this.memory.bytes <= config.offloadThresholdBytes) return;

    while (this.memory.bytes > config.offloadThresholdBytes && this.memory.map.size > 0) {
      const candidate = this.memory._candidateKey(config.evictionPolicy);
      if (!candidate) break;
      const entry = this.memory.map.get(candidate);
      if (!entry) {
        this.memory.map.delete(candidate);
        continue;
      }

      this.memory.offloads += 1;

      await CacheEntry.updateOne(
        { namespace: entry.namespace, key: entry.key },
        {
          $set: {
            value: entry.value,
            atRestFormat: entry.atRestFormat,
            sizeBytes: entry.sizeBytes,
            expiresAt: entry.expiresAt,
            lastAccessAt: entry.lastAccessAt,
            source: 'offloaded',
          },
          $setOnInsert: { hits: 0 },
        },
        { upsert: true },
      );

      this.memory.delete(candidate);
    }
  }
}

module.exports = new CacheLayerService();
