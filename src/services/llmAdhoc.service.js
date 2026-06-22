const axios = require("axios");
const {
  loadConfig,
  normalizeProviderConfig,
  computeCompletionURL,
  normalizeUsage,
  computeCostFromPricing,
  logAuditEntry,
  logger,
} = require("./llmConfig.service");

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
  
  logger.log('[llm.service] callAdhoc providerKey:', key);
  logger.log('[llm.service] callAdhoc available provider keys:', Object.keys(providers));
  logger.log('[llm.service] callAdhoc found provider:', !!provider, provider ? { enabled: provider.enabled, hasApiKey: !!provider.apiKey } : null);
  
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
    const curlHeaders = [
      `-H "Authorization: Bearer [REDACTED]"`,
      `-H "Content-Type: application/json"`,
      ...Object.entries(provider.extraHeaders || {}).map(([k, v]) => `-H "${k}: ${v}"`),
    ].join(' ');
    logger.log(`[llm.service] adhoc curl equivalent:\n  curl -X POST ${url} ${curlHeaders} -d '${JSON.stringify(body)}'\n`);

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

module.exports = {
  callAdhoc,
};
