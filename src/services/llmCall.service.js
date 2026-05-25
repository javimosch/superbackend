const axios = require("axios");
const cfg = require("./llmConfig.service");
const {
  loadConfig,
  normalizeProviderConfig,
  normalizePrompts,
  interpolateTemplate,
  computeCompletionURL,
  normalizeUsage,
  computeCostFromPricing,
  logAuditEntry,
  logger,
} = cfg;

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
    const curlHeaders = [
      `-H "Authorization: Bearer ${provider.apiKey}"`,
      `-H "Content-Type: application/json"`,
      ...Object.entries(provider.extraHeaders || {}).map(([k, v]) => `-H "${k}: ${v}"`),
    ].join(' ');
    logger.log(`[llm.service] curl equivalent:\n  curl -X POST ${url} ${curlHeaders} -d '${JSON.stringify(body)}'\n`);

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

async function testPrompt(definition, variables = {}, runtimeOptions = {}) {
  cfg.clearCache();
  return call(definition.key, variables, runtimeOptions);
}

let modelMetadataCache = {
  data: {},
  ts: 0
};
const MODEL_CACHE_TTL = 3600000;

async function getModelContextLength(modelId, providerKey) {
  if (modelMetadataCache.ts && Date.now() - modelMetadataCache.ts < MODEL_CACHE_TTL) {
    if (modelMetadataCache.data[modelId]) return modelMetadataCache.data[modelId];
  }

  if (providerKey !== 'openrouter') return 200000;

  try {
    const { providers } = await loadConfig();
    const provider = providers[providerKey];
    if (!provider || !provider.apiKey) return 200000;

    const res = await axios.get(`https://openrouter.ai/api/v1/models/${modelId}`, {
      headers: { 'Authorization': `Bearer ${provider.apiKey}` }
    });

    const contextLength = res?.data?.data?.context_length || 200000;
    
    modelMetadataCache.data[modelId] = contextLength;
    modelMetadataCache.ts = Date.now();
    
    return contextLength;
  } catch (e) {
    return 200000;
  }
}

module.exports = {
  call,
  testPrompt,
  getModelContextLength,
};
