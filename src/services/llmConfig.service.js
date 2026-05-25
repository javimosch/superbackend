const axios = require("axios");
const AuditEvent = require("../models/AuditEvent");
const GlobalSetting = require("../models/GlobalSetting");
const { decryptString } = require("../utils/encryption");

const PROVIDERS_KEY = "llm.providers";
const PROMPTS_KEY = "llm.prompts";

let cache = {
  providers: null,
  prompts: null,
  ts: 0,
};

const CACHE_TTL = 60000;

const logger = {
  log: (...args) => {
    if (process.env.DEBUG_LLM === 'true' && process.env.NODE_ENV !== 'test') {
       if (!process.env.TUI_MODE) console.log(...args);
    }
  },
  warn: (...args) => {
    if (process.env.DEBUG_LLM === 'true' && process.env.NODE_ENV !== 'test') {
       if (!process.env.TUI_MODE) console.warn(...args);
    }
  },
  error: (...args) => {
    console.error(...args);
  }
};

function computeCompletionURL(baseUrl) {
  const trimmed = baseUrl.replace(/\/$/, "");

  if (trimmed.includes('perplex')) {
    if (trimmed.endsWith('/chat/completions')) return trimmed;
    return trimmed + "/chat/completions";
  }

  if (/(?:^|\/)v1$/.test(trimmed)) {
    return trimmed + "/chat/completions";
  }
  if (trimmed.endsWith('/v1/chat/completions')) return trimmed;

  return trimmed + "/v1/chat/completions";
}

async function loadConfig() {
  const now = Date.now();
  if (cache.ts && now - cache.ts < CACHE_TTL && cache.providers && cache.prompts) {
    return { providers: cache.providers, prompts: cache.prompts };
  }

  const keys = [PROVIDERS_KEY, PROMPTS_KEY];
  const docs = await GlobalSetting.find({ key: { $in: keys } })
    .select("key value")
    .lean();

  const byKey = Array.isArray(docs)
    ? Object.fromEntries(docs.map((d) => [d.key, d.value]))
    : {};

  let providers = {};
  let prompts = {};

  try {
    providers = byKey[PROVIDERS_KEY]
      ? JSON.parse(byKey[PROVIDERS_KEY])
      : {};
  } catch (e) {
    providers = {};
  }

  try {
    prompts = byKey[PROMPTS_KEY] ? JSON.parse(byKey[PROMPTS_KEY]) : {};
  } catch (e) {
    prompts = {};
  }

  try {
    const apiKeyDocs = await GlobalSetting.find({
      key: { $regex: /^llm\.provider\..+\.apiKey$/ },
      type: "encrypted",
    })
      .select("key value type")
      .lean();

    if (Array.isArray(apiKeyDocs)) {
      for (const doc of apiKeyDocs) {
        const key = String(doc.key || "");
        const match = key.match(/^llm\.provider\.(.+)\.apiKey$/);
        if (!match) continue;
        const providerKey = match[1];
        if (!providerKey) continue;
        try {
          const payload = JSON.parse(doc.value);
          const apiKey = decryptString(payload);
          if (!providers[providerKey]) {
            providers[providerKey] = {};
          }
          providers[providerKey].apiKey = apiKey;
        } catch (e) {
        }
      }
    }
  } catch (e) {
  }

  cache = { providers, prompts, ts: now };
  return { providers, prompts };
}

function clearCache() {
  cache = { providers: null, prompts: null, ts: 0 };
}

function interpolateTemplate(template, variables) {
  const v = variables || {};
  return String(template || "").replace(/\{([^}]+)\}/g, (match, key) => {
    const k = String(key || "").trim();
    if (!Object.prototype.hasOwnProperty.call(v, k)) {
      return "";
    }
    const value = v[k];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

function normalizeProviderConfig(rawProviders) {
  const providers = {};
  const input = rawProviders && typeof rawProviders === "object" ? rawProviders : {};
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== "object") continue;
    const baseUrl = String(value.baseUrl || value.base_url || "").trim();
    if (!baseUrl) continue;
    providers[key] = {
      key,
      label: value.label || key,
      preset: value.preset || "custom",
      baseUrl,
      apiKey: value.apiKey || value.api_key || "",
      defaultModel: value.defaultModel || value.default_model || "",
      enabled: value.enabled !== false,
      modelPricing: value.modelPricing || value.model_pricing || {},
      extraHeaders: value.extraHeaders || {},
      timeoutMs: Number(value.timeoutMs || 60000),
    };
  }
  return providers;
}

function normalizeUsage(rawUsage) {
  if (!rawUsage || typeof rawUsage !== "object") return null;
  const promptTokens = Number(rawUsage.prompt_tokens);
  const completionTokens = Number(rawUsage.completion_tokens);
  const totalTokens = Number(rawUsage.total_tokens);

  const normalized = {
    prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : null,
    completion_tokens: Number.isFinite(completionTokens) ? completionTokens : null,
    total_tokens: Number.isFinite(totalTokens)
      ? totalTokens
      : (Number.isFinite(promptTokens) && Number.isFinite(completionTokens)
          ? promptTokens + completionTokens
          : null),
  };

  if (rawUsage.cost !== undefined && rawUsage.cost !== null) {
    const cost = Number(rawUsage.cost);
    if (Number.isFinite(cost)) {
      normalized.cost = cost;
    }
  }

  if (rawUsage.is_byok !== undefined) {
    normalized.is_byok = Boolean(rawUsage.is_byok);
  }

  normalized.raw = rawUsage;
  return normalized;
}

function computeCostFromPricing({ prompt_tokens, completion_tokens }, modelPricing) {
  if (!modelPricing || typeof modelPricing !== "object") return null;

  const promptTokens = Number(prompt_tokens);
  const completionTokens = Number(completion_tokens);
  if (!Number.isFinite(promptTokens) && !Number.isFinite(completionTokens)) return null;

  const inRate = Number(modelPricing.costPerMillionIn);
  const outRate = Number(modelPricing.costPerMillionOut);
  if (!Number.isFinite(inRate) && !Number.isFinite(outRate)) return null;

  const costIn = Number.isFinite(promptTokens) && Number.isFinite(inRate)
    ? (promptTokens / 1_000_000) * inRate
    : 0;
  const costOut = Number.isFinite(completionTokens) && Number.isFinite(outRate)
    ? (completionTokens / 1_000_000) * outRate
    : 0;

  const total = costIn + costOut;
  return Number.isFinite(total) ? total : null;
}

function normalizePrompts(rawPrompts) {
  const prompts = {};
  const input = rawPrompts && typeof rawPrompts === "object" ? rawPrompts : {};
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== "object") continue;
    const template = String(value.template || "");
    if (!template) continue;
    prompts[key] = {
      key,
      label: value.label || key,
      description: value.description || "",
      template,
      providerKey: value.providerKey || value.provider || "",
      model: value.model || "",
      defaultOptions: value.defaultOptions || {},
      inputSchema: value.inputSchema || null,
      enabled: value.enabled !== false,
    };
  }
  return prompts;
}

async function logAuditEntry({
  promptKey,
  providerKey,
  model,
  variables,
  requestOptions,
  outcome,
  errorMessage,
  usage,
}) {
  try {
    const event = new AuditEvent({
      actorType: "system",
      action: "llm.completion",
      outcome: outcome || (errorMessage ? "failure" : "success"),
      meta: {
        promptKey,
        providerKey,
        model,
        variables: variables || {},
        requestOptions: requestOptions || {},
        auditContext: requestOptions?.auditContext || null,
        errorMessage,
        usage: usage || null,
      },
    });
    await event.save();
  } catch (e) {
  }
}

module.exports = {
  PROVIDERS_KEY,
  PROMPTS_KEY,
  logger,
  cache,
  CACHE_TTL,
  computeCompletionURL,
  loadConfig,
  clearCache,
  interpolateTemplate,
  normalizeProviderConfig,
  normalizeUsage,
  computeCostFromPricing,
  normalizePrompts,
  logAuditEntry,
};
