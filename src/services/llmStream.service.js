const axios = require("axios");
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
} = require("./llmConfig.service");

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
    const curlHeaders = [
      `-H "Authorization: Bearer ${provider.apiKey}"`,
      `-H "Content-Type: application/json"`,
      ...Object.entries(provider.extraHeaders || {}).map(([k, v]) => `-H "${k}: ${v}"`),
    ].join(' ');
    logger.log(`[llm.service] streaming curl equivalent:\n  curl -X POST ${url} ${curlHeaders} -d '${JSON.stringify(body)}'\n`);

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
            console.error('[llmStream] Error parsing stream chunk:', e?.message || e);
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

async function streamAdhoc(
  {
    providerKey,
    model,
    messages,
    promptKeyForAudit,
  },
  runtimeOptions = {},
  { onToken, onReasoning } = {}
) {
  const { providers: rawProviders } = await loadConfig();
  const providers = normalizeProviderConfig(rawProviders);

  const key = String(providerKey || "").trim();
  let provider = providers[key];
  
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
  const inputMessages = Array.isArray(messages) ? messages : [];
  if (!inputMessages.length) throw new Error("messages is required");

  const url = computeCompletionURL(provider.baseUrl);
  const body = {
    model: resolvedModel,
    messages: inputMessages,
    stream: true
  };

  const allowedOptions = ["temperature", "top_p", "max_tokens", "presence_penalty", "frequency_penalty", "stop", "n", "tools", "tool_choice"];
  for (const key of allowedOptions) {
    if (runtimeOptions[key] !== undefined) body[key] = runtimeOptions[key];
  }

  let fullText = "";
  let fullReasoning = "";
  let lastUsage = null;
  let toolCalls = [];

  const curlHeaders = [
    `-H "Authorization: Bearer ${provider.apiKey}"`,
    `-H "Content-Type: application/json"`,
    ...Object.entries(provider.extraHeaders || {}).map(([k, v]) => `-H "${k}: ${v}"`),
  ].join(' ');
  logger.log(`[llm.service] streamAdhoc curl equivalent:\n  curl -X POST ${url} ${curlHeaders} -d '${JSON.stringify(body)}'\n`);

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
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          if (parsed.usage) lastUsage = parsed.usage;

          const choice = parsed.choices?.[0];
          if (!choice) {
            const topReasoning = parsed.reasoning_content || parsed.reasoning || parsed.thinking;
            if (topReasoning) {
                fullReasoning += topReasoning;
                if (onReasoning) onReasoning(topReasoning);
            }
            continue;
          }

          const delta = choice.delta || {};
          
          if (delta.content) {
            fullText += delta.content;
            if (onToken) onToken(delta.content);
          }

          const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking || choice.reasoning_content || choice.reasoning;
          if (reasoning) {
            fullReasoning += reasoning;
            if (onReasoning) onReasoning(reasoning);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index === undefined) tc.index = 0;
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = {
                  id: tc.id,
                  type: 'function',
                  function: { name: '', arguments: '' }
                };
              }
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
            }
          }
        } catch (e) {
          console.error('[llmStream] Error processing stream chunk:', e?.message || e);
        }
      }
    });

    response.data.on("end", () => resolve());
    response.data.on("error", (err) => reject(err));
  });

  const finalUsage = normalizeUsage(lastUsage);

  await logAuditEntry({
    promptKey: String(promptKeyForAudit || "adhoc_stream"),
    providerKey: provider.key,
    model: resolvedModel,
    variables: {},
    requestOptions: runtimeOptions,
    outcome: "success",
    usage: finalUsage,
  });

  return {
    content: fullText,
    reasoning: fullReasoning,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    model: resolvedModel,
    providerKey: provider.key,
    usage: finalUsage
  };
}

module.exports = {
  stream,
  streamAdhoc,
};
