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


function computeCompletionURL(baseUrl) {
  const trimmed = baseUrl.replace(/\/$/, "");

  // Perplexity: already exposes /chat/completions
  if (trimmed.includes('perplex')) {
    if (trimmed.endsWith('/chat/completions')) return trimmed;
    return trimmed + "/chat/completions";
  }

  // If base already includes /v1 (e.g., https://openrouter.ai/api/v1), do not append another /v1
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

  // Load encrypted API keys for providers
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
          // Ignore decryption errors for individual providers
        }
      }
    }
  } catch (e) {
    // Do not fail overall config load if encrypted keys query fails
  }

  cache = { providers, prompts, ts: now };
  return { providers, prompts };
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
        errorMessage,
        usage: usage || null,
      },
    });
    await event.save();
  } catch (e) {
    // Do not throw on audit failure
  }
}



async function call(promptKey, variables = {}, runtimeOptions = {}) {
  const { providers: rawProviders, prompts: rawPrompts } = await loadConfig();
  const providers = normalizeProviderConfig(rawProviders);
  const prompts = normalizePrompts(rawPrompts);

  const prompt = prompts[promptKey];
  if (!prompt || prompt.enabled === false) {
    throw new Error("Prompt not found or disabled");
  }

  const provider = providers[prompt.providerKey];
  if (!provider || provider.enabled === false || !provider.apiKey) {
    throw new Error("Provider not found, disabled, or missing apiKey");
  }

  const mergedOptions = {
    ...(prompt.defaultOptions || {}),
    ...(runtimeOptions || {}),
  };

  const model =
    mergedOptions.model || prompt.model || provider.defaultModel || "";
  if (!model) {
    throw new Error("Model is not configured");
  }

  const content = interpolateTemplate(prompt.template, variables);

  const url = computeCompletionURL(provider.baseUrl);

  const body = {
    model,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  };

  const allowedOptions = [
    "temperature",
    "top_p",
    "max_tokens",
    "presence_penalty",
    "frequency_penalty",
    "stop",
    "n",
    "stream",
    "tools",
    "tool_choice",
  ];

  for (const key of allowedOptions) {
    if (mergedOptions[key] !== undefined) {
      body[key] = mergedOptions[key];
    }
  }

  let response;
  let text = "";
  let usage = null;

  try {
    // Debug: log curl equivalent
    const curlHeaders = [
      `-H "Authorization: Bearer ${provider.apiKey}"`,
      `-H "Content-Type: application/json"`,
      ...Object.entries(provider.extraHeaders || {}).map(([k, v]) => `-H "${k}: ${v}"`),
    ].join(' ');
    console.log(`[llm.service] curl equivalent:\n  curl -X POST ${url} ${curlHeaders} -d '${JSON.stringify(body)}'\n`);

    response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...provider.extraHeaders,
      },
      timeout: provider.timeoutMs,
    });

    const data = response && response.data ? response.data : {};
    const choice =
      Array.isArray(data.choices) && data.choices.length > 0
        ? data.choices[0]
        : null;
    text =
      choice && choice.message && typeof choice.message.content === "string"
        ? choice.message.content
        : "";
    const rawUsage = data.usage || null;
    const normalized = normalizeUsage(rawUsage);

    if (normalized && normalized.cost === undefined) {
      const pricing =
        provider.modelPricing && typeof provider.modelPricing === "object"
          ? provider.modelPricing[model]
          : null;
      const computedCost = pricing
        ? computeCostFromPricing(normalized, pricing)
        : null;
      if (computedCost !== null) {
        normalized.cost = computedCost;
        normalized.cost_source = "computed";
      }
    }

    if (normalized && normalized.cost !== undefined && normalized.cost_source === undefined) {
      normalized.cost_source = "provider";
    }

    usage = normalized;

    await logAuditEntry({
      promptKey,
      providerKey: provider.key,
      model,
      variables,
      requestOptions: mergedOptions,
      outcome: "success",
      usage,
    });
  } catch (error) {
    const message =
      (error.response && error.response.data && error.response.data.error &&
        error.response.data.error.message) ||
      error.message ||
      "LLM request failed";

    await logAuditEntry({
      promptKey,
      providerKey: provider.key,
      model,
      variables,
      requestOptions: mergedOptions,
      outcome: "failure",
      errorMessage: message,
    });

    throw new Error(message);
  }

  return {
    content: text,
    model,
    providerKey: provider.key,
    usage,
    raw: response && response.data ? response.data : null,
  };
}

async function callAdhoc(
  {
    providerKey,
    model,
    messages,
    promptKeyForAudit,
  },
  runtimeOptions = {},
) {
  const { providers: rawProviders } = await loadConfig();
  const providers = normalizeProviderConfig(rawProviders);

  const key = String(providerKey || "").trim();
  let provider = providers[key];
  
  console.log('[llm.service] callAdhoc providerKey:', key);
  console.log('[llm.service] callAdhoc available provider keys:', Object.keys(providers));
  console.log('[llm.service] callAdhoc found provider:', !!provider, provider ? { enabled: provider.enabled, hasApiKey: !!provider.apiKey } : null);
  
  // Apply runtime overrides for provider if possible
  if (runtimeOptions.apiKey || runtimeOptions.baseUrl) {
    provider = {
      ...(provider || { key: key || 'custom', enabled: true, baseUrl: 'https://openrouter.ai/api/v1' }),
      ...(runtimeOptions.apiKey ? { apiKey: runtimeOptions.apiKey } : {}),
      ...(runtimeOptions.baseUrl ? { baseUrl: runtimeOptions.baseUrl } : {}),
    };
  }

  if (!provider || provider.enabled === false || !provider.apiKey) {
    throw new Error("Provider not found, disabled, or missing apiKey");
  }

  const resolvedModel = String(model || runtimeOptions.model || provider.defaultModel || "google/gemini-2.5-flash-lite").trim();
  if (!resolvedModel) {
    throw new Error("Model is not configured");
  }

  const inputMessages = Array.isArray(messages) ? messages : [];
  if (!inputMessages.length) {
    throw new Error("messages is required");
  }

  const mergedOptions = {
    ...(runtimeOptions || {}),
  };

  const url = computeCompletionURL(provider.baseUrl);

  const body = {
    model: resolvedModel,
    messages: inputMessages,
  };

  const allowedOptions = [
    "temperature",
    "top_p",
    "max_tokens",
    "presence_penalty",
    "frequency_penalty",
    "stop",
    "n",
    "stream",
    "tools",
    "tool_choice",
  ];

  for (const key of allowedOptions) {
    if (mergedOptions[key] !== undefined) {
      body[key] = mergedOptions[key];
    }
  }

  let response;
  let text = "";
  let usage = null;
  let toolCalls = null;

  try {
    // Debug: log curl equivalent
    const curlHeaders = [
      `-H "Authorization: Bearer ${provider.apiKey}"`,
      `-H "Content-Type: application/json"`,
      ...Object.entries(provider.extraHeaders || {}).map(([k, v]) => `-H "${k}: ${v}"`),
    ].join(' ');
    console.log(`[llm.service] adhoc curl equivalent:\n  curl -X POST ${url} ${curlHeaders} -d '${JSON.stringify(body)}'\n`);

    response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...provider.extraHeaders,
      },
      timeout: provider.timeoutMs,
    });

    const data = response && response.data ? response.data : {};
    const choice =
      Array.isArray(data.choices) && data.choices.length > 0
        ? data.choices[0]
        : null;
    text =
      choice && choice.message && typeof choice.message.content === "string"
        ? choice.message.content
        : "";
    
    toolCalls = choice && choice.message && Array.isArray(choice.message.tool_calls)
        ? choice.message.tool_calls
        : null;

    const rawUsage = data.usage || null;
    const normalized = normalizeUsage(rawUsage);

    if (normalized && normalized.cost === undefined) {
      const pricing =
        provider.modelPricing && typeof provider.modelPricing === "object"
          ? provider.modelPricing[resolvedModel]
          : null;
      const computedCost = pricing
        ? computeCostFromPricing(normalized, pricing)
        : null;
      if (computedCost !== null) {
        normalized.cost = computedCost;
        normalized.cost_source = "computed";
      }
    }

    if (normalized && normalized.cost !== undefined && normalized.cost_source === undefined) {
      normalized.cost_source = "provider";
    }

    usage = normalized;

    await logAuditEntry({
      promptKey: String(promptKeyForAudit || "adhoc"),
      providerKey: provider.key,
      model: resolvedModel,
      variables: {},
      requestOptions: mergedOptions,
      outcome: "success",
      usage,
    });
  } catch (error) {
    const message =
      (error.response && error.response.data && error.response.data.error &&
        error.response.data.error.message) ||
      error.message ||
      "LLM request failed";

    await logAuditEntry({
      promptKey: String(promptKeyForAudit || "adhoc"),
      providerKey: provider && provider.key,
      model: resolvedModel,
      variables: {},
      requestOptions: mergedOptions || {},
      outcome: "failure",
      errorMessage: message,
    });

    throw new Error(message);
  }

  return {
    content: text,
    toolCalls,
    model: resolvedModel,
    providerKey: provider.key,
    usage,
    raw: response && response.data ? response.data : null,
  };
}

async function testPrompt(definition, variables = {}, runtimeOptions = {}) {
  // Bypass cache to ensure we see latest settings
  cache.ts = 0;
  return call(definition.key, variables, runtimeOptions);
}

async function stream(promptKey, variables = {}, runtimeOptions = {}, { onToken } = {}) {
  if (typeof onToken !== "function") {
    throw new Error("onToken callback is required for streaming");
  }

  const { providers: rawProviders, prompts: rawPrompts } = await loadConfig();
  const providers = normalizeProviderConfig(rawProviders);
  const prompts = normalizePrompts(rawPrompts);

  const prompt = prompts[promptKey];
  if (!prompt || prompt.enabled === false) {
    throw new Error("Prompt not found or disabled");
  }

  const provider = providers[prompt.providerKey];
  if (!provider || provider.enabled === false || !provider.apiKey) {
    throw new Error("Provider not found, disabled, or missing apiKey");
  }

  const mergedOptions = {
    ...(prompt.defaultOptions || {}),
    ...(runtimeOptions || {}),
    stream: true,
  };

  const model =
    mergedOptions.model || prompt.model || provider.defaultModel || "";
  if (!model) {
    throw new Error("Model is not configured");
  }

  const content = interpolateTemplate(prompt.template, variables);
  const url = computeCompletionURL(provider.baseUrl);

  const body = {
    model,
    stream: true,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  };

  const allowedOptions = [
    "temperature",
    "top_p",
    "max_tokens",
    "presence_penalty",
    "frequency_penalty",
    "stop",
    "n",
  ];

  for (const key of allowedOptions) {
    if (mergedOptions[key] !== undefined) {
      body[key] = mergedOptions[key];
    }
  }

  let errorMessage = null;
  let lastUsage = null;

  try {
    // Debug: log curl equivalent for streaming
    const curlHeaders = [
      `-H "Authorization: Bearer ${provider.apiKey}"`,
      `-H "Content-Type: application/json"`,
      ...Object.entries(provider.extraHeaders || {}).map(([k, v]) => `-H "${k}: ${v}"`),
    ].join(' ');
    console.log(`[llm.service] streaming curl equivalent:\n  curl -X POST ${url} ${curlHeaders} -d '${JSON.stringify(body)}'\n`);

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...provider.extraHeaders,
      },
      timeout: provider.timeoutMs,
      responseType: "stream",
    });

    await new Promise((resolve, reject) => {
      let buffer = "";
      response.data.on("data", (chunk) => {
        buffer += chunk.toString("utf8");

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            continue;
          }
          try {
            const parsed = JSON.parse(payload);

            if (parsed && parsed.usage && typeof parsed.usage === "object") {
              lastUsage = parsed.usage;
            }

            const choice =
              Array.isArray(parsed.choices) && parsed.choices.length > 0
                ? parsed.choices[0]
                : null;
            const delta = choice && choice.delta ? choice.delta : {};
            const text = typeof delta.content === "string" ? delta.content : "";
            if (text) {
              onToken(text, parsed);
            }
          } catch (e) {
            // Ignore parse errors for individual chunks
          }
        }
      });

      response.data.on("end", () => resolve());
      response.data.on("error", (err) => {
        errorMessage = err.message || "Stream error";
        reject(err);
      });
    });

    await logAuditEntry({
      promptKey,
      providerKey: provider.key,
      model,
      variables,
      requestOptions: mergedOptions,
      outcome: "success",
      usage: (() => {
        const normalized = normalizeUsage(lastUsage);
        if (!normalized) return null;
        if (normalized.cost === undefined) {
          const pricing =
            provider.modelPricing && typeof provider.modelPricing === "object"
              ? provider.modelPricing[model]
              : null;
          const computedCost = pricing
            ? computeCostFromPricing(normalized, pricing)
            : null;
          if (computedCost !== null) {
            normalized.cost = computedCost;
            normalized.cost_source = "computed";
          }
        }
        if (normalized.cost !== undefined && normalized.cost_source === undefined) {
          normalized.cost_source = "provider";
        }
        return normalized;
      })(),
    });
  } catch (error) {
    const message =
      (error.response && error.response.data && error.response.data.error &&
        error.response.data.error.message) ||
      error.message ||
      errorMessage ||
      "LLM streaming request failed";

    await logAuditEntry({
      promptKey,
      providerKey: provider && provider.key,
      model,
      variables,
      requestOptions: mergedOptions || {},
      outcome: "failure",
      errorMessage: message,
    });

    throw new Error(message);
  }
}

module.exports = {
  call,
  testPrompt,
  callAdhoc,
  stream,
};
