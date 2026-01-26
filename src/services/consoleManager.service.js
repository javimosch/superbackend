const crypto = require("crypto");

const ConsoleEntry = require("../models/ConsoleEntry");
const ConsoleLog = require("../models/ConsoleLog");
const cacheLayer = require("./cacheLayer.service");
const {
  getJsonConfig,
  createJsonConfig,
  updateJsonConfig,
} = require("./jsonConfigs.service");
const JsonConfig = require("../models/JsonConfig");
const { logErrorSync } = require("./errorLogger");
const CronJob = require("../models/CronJob");
const ScriptDefinition = require("../models/ScriptDefinition");

let isActive = false;
let previousConsole = null;
let isHandling = false;

const DEFAULT_ALIAS = "console-manager";

const METHODS = ["debug", "log", "info", "warn", "error"];

function clamp(str, maxLen) {
  const s = String(str ?? "");
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

function normalizeMessage(message) {
  if (!message) return "";
  return String(message)
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<UUID>",
    )
    .replace(/[0-9a-f]{24}/gi, "<OBJECTID>")
    .replace(/\b\d{4,}\b/g, "<NUM>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function extractTopFrame(stack) {
  if (!stack) return "";
  // Skip: Error, console wrapper, handleConsoleCall
  const lines = String(stack).split("\n").slice(3, 6);
  for (const line of lines) {
    const match = line.match(/at\s+(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?/);
    if (match) {
      const fn = match[1] || "<anonymous>";
      const file = match[2].split("/").pop();
      return `${fn}@${file}:${match[3]}`;
    }
  }
  return "";
}

function computeHash({ method, messageTemplate, topFrame }) {
  const parts = [method || "", messageTemplate || "", topFrame || ""];
  const hash = crypto
    .createHash("sha256")
    .update(parts.join("|"))
    .digest("hex");
  return hash.slice(0, 32);
}

function safeArgsPreview(
  args,
  { maxArgChars = 2000, maxArgsSerialized = 5 } = {},
) {
  const list = Array.isArray(args)
    ? args.slice(0, Math.max(0, Number(maxArgsSerialized || 0) || 0))
    : [];
  const out = [];

  for (const a of list) {
    if (typeof a === "string") {
      out.push(clamp(a, maxArgChars));
      continue;
    }

    if (a instanceof Error) {
      out.push(clamp(a.stack || a.message || a.name || "Error", maxArgChars));
      continue;
    }

    try {
      out.push(clamp(JSON.stringify(a), maxArgChars));
    } catch {
      out.push(clamp(String(a), maxArgChars));
    }
  }

  return out.join(" ");
}

async function ensureJsonConfigExists() {
  const existing = await JsonConfig.findOne({
    $or: [{ slug: DEFAULT_ALIAS }, { alias: DEFAULT_ALIAS }],
  })
    .select("_id")
    .lean();
  if (existing) return;

  const initial = {
    enabled: true,
    defaultEntryEnabled: true,
    defaults: {
      persist: {
        cache: false,
        db: false,
        warnErrorToCacheDb: false,
      },
    },
    db: {
      enabled: false,
      ttlDays: 7,
      sampleRatePercent: 100,
    },
    cache: {
      enabled: false,
      ttlSeconds: 3600,
      namespace: "console-manager",
    },
    performance: {
      maxArgChars: 2000,
      maxArgsSerialized: 5,
    },
  };

  await createJsonConfig({
    title: "Console Manager",
    alias: DEFAULT_ALIAS,
    jsonRaw: JSON.stringify(initial, null, 2),
    publicEnabled: false,
    cacheTtlSeconds: 2,
  });
}

async function getConfigSafe() {
  try {
    await ensureJsonConfigExists();
  } catch {
    // ignore
  }

  try {
    const cfg = await getJsonConfig(DEFAULT_ALIAS, { bypassCache: false });
    return cfg && typeof cfg === "object" ? cfg : null;
  } catch {
    return null;
  }
}

function shouldSample(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p)) return true;
  if (p >= 100) return true;
  if (p <= 0) return false;
  return Math.random() * 100 <= p;
}

function computeExpiresAt(ttlDays) {
  const days = Number(ttlDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

let queue = [];
let isDraining = false;
const MAX_QUEUE = 5000;

function enqueue(task) {
  if (queue.length >= MAX_QUEUE) {
    queue.shift();
  }
  queue.push(task);
  drainAsync();
}

function drainAsync() {
  if (isDraining) return;
  isDraining = true;

  setImmediate(async () => {
    try {
      for (let i = 0; i < 200; i += 1) {
        const task = queue.shift();
        if (!task) break;
        // eslint-disable-next-line no-await-in-loop
        await task();
      }
    } catch {
      // ignore
    } finally {
      isDraining = false;
      if (queue.length > 0) {
        drainAsync();
      }
    }
  });
}

async function upsertEntry({
  hash,
  method,
  messageTemplate,
  topFrame,
  cfg,
  args,
}) {
  const defaultEnabled = cfg?.defaultEntryEnabled !== false;

  const shouldDefaultPersistWarnError = Boolean(
    cfg?.defaults?.persist?.warnErrorToCacheDb,
  );
  const defaultPersistCache = Boolean(cfg?.defaults?.persist?.cache);
  const defaultPersistDb = Boolean(cfg?.defaults?.persist?.db);

  const autoPersist =
    shouldDefaultPersistWarnError && (method === "warn" || method === "error");

  const persistToCache = Boolean(defaultPersistCache || autoPersist);
  const persistToDb = Boolean(defaultPersistDb || autoPersist);

  const perf = cfg?.performance || {};

  const lastSample = {
    argsPreview: safeArgsPreview(args, perf),
  };

  const now = new Date();

  const doc = await ConsoleEntry.findOneAndUpdate(
    { hash },
    {
      $set: {
        method,
        messageTemplate,
        topFrame,
        lastSeenAt: now,
        lastSample,
      },
      $inc: { countTotal: 1 },
      $setOnInsert: {
        enabled: defaultEnabled,
        enabledExplicit: false,
        persistToCache,
        persistToDb,
        persistExplicit: false,
        tags: [],
        firstSeenAt: now,
      },
    },
    { upsert: true, new: true },
  ).lean();

  return doc;
}

function buildMessageFromArgs(args) {
  for (const a of args) {
    if (typeof a === "string" && a.trim()) return a;
    if (a instanceof Error) return a.message || a.name || "Error";
  }
  try {
    return args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
  } catch {
    return args.map((a) => String(a)).join(" ");
  }
}

function captureErrorAggregationFromArgs(args) {
  try {
    let errorObj = null;
    for (const a of args) {
      if (a instanceof Error) {
        errorObj = a;
        break;
      }
    }

    const message = errorObj ? errorObj.message : buildMessageFromArgs(args);

    logErrorSync({
      source: "backend",
      severity: "error",
      errorName: errorObj?.name || "ConsoleError",
      message,
      stack: errorObj?.stack,
      extra: {
        consoleArgs: Array.isArray(args) ? args.length : 0,
        consoleManager: true,
      },
    });
  } catch {
    // ignore
  }
}

async function persistOccurrence({ cfg, entry, method, args }) {
  const cacheCfg = cfg?.cache || {};
  const dbCfg = cfg?.db || {};

  const persistCache =
    Boolean(cacheCfg.enabled) && Boolean(entry?.persistToCache);
  const persistDb = Boolean(dbCfg.enabled) && Boolean(entry?.persistToDb);

  if (!persistCache && !persistDb) return;

  const perf = cfg?.performance || {};
  const argsPreview = safeArgsPreview(args, perf);

  if (persistCache) {
    const namespace = String(cacheCfg.namespace || "console-manager");
    const ttlSeconds = Number(cacheCfg.ttlSeconds || 0) || 3600;

    enqueue(async () => {
      try {
        const countKey = `entry:${entry.hash}:count`;
        const lastKey = `entry:${entry.hash}:last`;

        const existingCount = await cacheLayer.get(countKey, { namespace });
        const nextCount = (Number(existingCount || 0) || 0) + 1;

        await cacheLayer.set(countKey, nextCount, { namespace, ttlSeconds });
        await cacheLayer.set(lastKey, new Date().toISOString(), {
          namespace,
          ttlSeconds,
        });
      } catch {
        // ignore
      }
    });
  }

  if (persistDb) {
    if (!shouldSample(dbCfg.sampleRatePercent)) return;

    const expiresAt = computeExpiresAt(dbCfg.ttlDays || 7);

    const message = clamp(buildMessageFromArgs(args), 2000);

    enqueue(async () => {
      try {
        await ConsoleLog.create({
          entryHash: entry.hash,
          method,
          message,
          argsPreview: clamp(argsPreview, 5000),
          tagsSnapshot: Array.isArray(entry.tags) ? entry.tags : [],
          requestId: "",
          createdAt: new Date(),
          expiresAt,
        });
      } catch {
        // ignore
      }
    });
  }
}

let memoryEntries = new Map();
let configFromMemory = null;

/**
 * It needs to be sync
 * 
 * persist entry + db persistance is async, we do not wait for it
 * @param {*} method 
 * @param {*} args 
 * @param {*} stack 
 * @returns 
 */
function handleConsoleCall(method, args, stack) {
  const message = buildMessageFromArgs(args);
  const messageTemplate = normalizeMessage(message);
  const topFrame = extractTopFrame(stack);
  const hash = computeHash({ method, messageTemplate, topFrame });

  let entryFromMemory = memoryEntries.get(hash);

  asyncUpdate();

  if (!configFromMemory && !entryFromMemory) {
    // First pass - always log and wait for async update to complete
    previousConsole[method](...args);
    return;
  } 
  
  // Check if console manager is globally disabled
  if (configFromMemory && configFromMemory.enabled === false) {
    previousConsole[method](...args);
    return;
  }

  // Check if this specific entry is enabled
  const isEnabled = entryFromMemory
    ? entryFromMemory.enabled !== false
    : configFromMemory.defaultEntryEnabled !== false;
    
  if (isEnabled) {
    previousConsole[method](...args);
  } else {
    // Entry is disabled - suppress stdout but still capture error aggregation for errors
    if (method === "error") {
      captureErrorAggregationFromArgs(args);
    }
  }

  async function asyncUpdate() {
    const cfg = await getConfigSafe();
    configFromMemory = cfg;
    let entry;
    let error = null;
    try {
      entry = await upsertEntry({
        hash,
        method,
        messageTemplate,
        topFrame,
        cfg,
        args,
      });
    } catch (e) {
      error = e;
      entry = null;
    }
    if (entry) {
      try {
        await persistOccurrence({ cfg, entry, method, args });
      } catch {
        // ignore
      }
    }
    memoryEntries.set(hash, entry);
    if (error) {
      previousConsole.error("Failed to upsert console entry:", error);
    }
  }
}

async function waitForDbReady({ maxWaitMs = 15000 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (require("mongoose").connection.readyState === 1) return true;
    if (Date.now() - start > maxWaitMs) return false;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function ensureRetentionCron() {
  const ok = await waitForDbReady({ maxWaitMs: 15000 });
  if (!ok) return;

  await ensureJsonConfigExists();

  const scriptCodeIdentifier = "console-manager-retention";
  let script = await ScriptDefinition.findOne({
    codeIdentifier: scriptCodeIdentifier,
  });
  if (!script) {
    script = await ScriptDefinition.create({
      name: "Console Manager Retention",
      codeIdentifier: scriptCodeIdentifier,
      description:
        "Deletes ConsoleLog records older than configured retention (best-effort).",
      type: "node",
      runner: "host",
      script: `const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI/MONGO_URI');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 2 });

  const jsonConfigSchema = new mongoose.Schema(
    {
      title: { type: String, required: true },
      slug: { type: String, required: true, unique: true, index: true },
      alias: { type: String, unique: true, sparse: true, index: true },
      publicEnabled: { type: Boolean, default: false },
      cacheTtlSeconds: { type: Number, default: 0 },
      jsonRaw: { type: String, required: true },
      jsonHash: { type: String, default: null },
    },
    { timestamps: true, collection: 'jsonconfigs' },
  );
  const JsonConfig = mongoose.models.JsonConfig || mongoose.model('JsonConfig', jsonConfigSchema);

  let ttlDays = 7;
  const cfgDoc = await JsonConfig.findOne({ $or: [{ slug: 'console-manager' }, { alias: 'console-manager' }] }).lean();
  if (cfgDoc && cfgDoc.jsonRaw) {
    try {
      const cfg = JSON.parse(String(cfgDoc.jsonRaw));
      const n = Number(cfg?.db?.ttlDays);
      if (Number.isFinite(n) && n > 0) ttlDays = n;
    } catch {
      // ignore
    }
  }

  const consoleLogSchema = new mongoose.Schema(
    {
      entryHash: { type: String, required: true, index: true },
      method: { type: String, enum: ['debug', 'log', 'info', 'warn', 'error'], required: true, index: true },
      message: { type: String, default: '', maxlength: 2000 },
      argsPreview: { type: String, default: '', maxlength: 5000 },
      tagsSnapshot: { type: [String], default: [], index: true },
      requestId: { type: String, default: '', index: true },
      createdAt: { type: Date, default: Date.now, index: true },
      expiresAt: { type: Date, default: null, index: true },
    },
    { timestamps: false, collection: 'console_logs' },
  );
  consoleLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  consoleLogSchema.index({ entryHash: 1, createdAt: -1 });
  const ConsoleLog = mongoose.models.ConsoleLog || mongoose.model('ConsoleLog', consoleLogSchema);

  const now = new Date();
  const cutoff = new Date(now.getTime() - ttlDays * 24 * 60 * 60 * 1000);
  await ConsoleLog.deleteMany({ $or: [{ expiresAt: { $lt: now } }, { createdAt: { $lt: cutoff } }] });

  await mongoose.disconnect();
})().catch(async (err) => {
  try { console.error('[ConsoleManagerRetention] Failed:', err?.message || err); } catch {}
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
`,
      enabled: true,
      timeoutMs: 5 * 60 * 1000,
    });
  } else if (script.runner !== "host" || script.type !== "node") {
    script.type = "node";
    script.runner = "host";
    await script.save();
  }

  const cronName = "Console Manager Retention";
  let job = await CronJob.findOne({ name: cronName, taskType: "script" });
  if (!job) {
    job = await CronJob.create({
      name: cronName,
      description: "Daily cleanup for Console Manager logs (7 days).",
      cronExpression: "0 3 * * *",
      timezone: "UTC",
      enabled: true,
      nextRunAt: null,
      taskType: "script",
      scriptId: script._id,
      scriptEnv: [],
      timeoutMs: 5 * 60 * 1000,
      createdBy: "system",
    });
  }

  try {
    const cronScheduler = require("./cronScheduler.service");
    if (job.enabled) {
      await cronScheduler.scheduleJob(job);
    }
  } catch {
    // ignore
  }
}

const consoleManager = {
  getConsole:()=>console,
  init() {
    if (isActive) return;
    if (isHandling) return;

    previousConsole = { ...console };

    METHODS.forEach((method) => {
      console[method] = (...args) => {
        if (!previousConsole) {
          // Fallback to original console if not initialized
          return;
        }

        if (isHandling) {
          // Prevent re-entrancy, just forward to previous console
          previousConsole[method](...args);
          return;
        }

        // Capture stack trace here to get the actual caller
        const stack = new Error().stack;

        isHandling = true;
        try {
          handleConsoleCall(method, args, stack);
        } catch (e) {
          // If anything fails, fallback to previous console
          previousConsole.error("[Console Manager Error]", e);
          previousConsole[method](...args);
        } finally {
          isHandling = false;
        }
      };
    });

    // Also override global.console to ensure all modules use the managed console
    console.overrided=true
    global.console = console;

    isActive = true;

    previousConsole.info("[Console Manager] Console override initialized");

    setImmediate(() => {
      ensureRetentionCron().catch(() => {});
    });
  },

  restore() {
    if (!isActive && !previousConsole) return;

    if (previousConsole) {
      METHODS.forEach((method) => {
        console[method] = previousConsole[method];
      });
      global.console = previousConsole;
      previousConsole = null;
    }

    isActive = false;
    queue = [];
    isDraining = false;
    isHandling = false;
  },

  isActive() {
    return isActive;
  },

  async getConfig() {
    const cfg = await getConfigSafe();
    return cfg;
  },

  async updateConfig(newCfg) {
    await ensureJsonConfigExists();
    const doc = await JsonConfig.findOne({
      $or: [{ slug: DEFAULT_ALIAS }, { alias: DEFAULT_ALIAS }],
    });
    if (!doc) {
      throw new Error("Console Manager config not found");
    }

    const updated = await updateJsonConfig(doc._id, {
      jsonRaw: JSON.stringify(newCfg, null, 2),
      title: "Console Manager",
      alias: DEFAULT_ALIAS,
      publicEnabled: false,
      cacheTtlSeconds: 2,
    });

    return updated;
  },

  async applyDefaultsRetroactively(cfg) {
    const defaultEnabled = cfg?.defaultEntryEnabled !== false;
    const warnErrorToCacheDb = Boolean(
      cfg?.defaults?.persist?.warnErrorToCacheDb,
    );
    const defaultPersistCache = Boolean(cfg?.defaults?.persist?.cache);
    const defaultPersistDb = Boolean(cfg?.defaults?.persist?.db);

    await ConsoleEntry.updateMany(
      { enabledExplicit: false },
      { $set: { enabled: defaultEnabled } },
    );

    await ConsoleEntry.updateMany(
      { persistExplicit: false, method: { $in: ["warn", "error"] } },
      {
        $set: {
          persistToCache: Boolean(defaultPersistCache || warnErrorToCacheDb),
          persistToDb: Boolean(defaultPersistDb || warnErrorToCacheDb),
        },
      },
    );

    await ConsoleEntry.updateMany(
      { persistExplicit: false, method: { $in: ["debug", "log", "info"] } },
      {
        $set: {
          persistToCache: Boolean(defaultPersistCache),
          persistToDb: Boolean(defaultPersistDb),
        },
      },
    );
  },
};

module.exports = consoleManager;
