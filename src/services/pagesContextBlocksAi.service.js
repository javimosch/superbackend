const llmService = require('./llm.service');
const { resolveLlmProviderModel } = require('./llmDefaults.service');
const { createAuditEvent } = require('./audit.service');

const ALLOWED_BLOCK_TYPES = new Set(['context.db_query', 'context.service_invoke']);

function parseJsonFromModelOutput(raw) {
  const text = String(raw || '').trim();

  try {
    return JSON.parse(text);
  } catch (_) {
    const m = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
    if (m) {
      return JSON.parse(String(m[1] || '').trim());
    }

    const idx = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (idx !== -1 && last !== -1 && last > idx) {
      return JSON.parse(text.slice(idx, last + 1));
    }

    const err = new Error('AI response was not valid JSON');
    err.code = 'AI_INVALID';
    throw err;
  }
}

function normalizeBlockType(v) {
  return String(v || '').trim();
}

function validateProposalShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    const err = new Error('AI proposal must be a JSON object');
    err.code = 'AI_INVALID';
    throw err;
  }

  const type = normalizeBlockType(obj.type);
  if (!ALLOWED_BLOCK_TYPES.has(type)) {
    const err = new Error(`AI proposal type must be one of: ${Array.from(ALLOWED_BLOCK_TYPES).join(', ')}`);
    err.code = 'AI_INVALID';
    throw err;
  }

  const props = obj.props;
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    const err = new Error('AI proposal props must be an object');
    err.code = 'AI_INVALID';
    throw err;
  }

  if (props.cache !== undefined && props.cache !== null) {
    if (typeof props.cache !== 'object' || Array.isArray(props.cache)) {
      const err = new Error('AI proposal props.cache must be an object');
      err.code = 'AI_INVALID';
      throw err;
    }
    if (props.cache.ttlSeconds !== undefined && props.cache.ttlSeconds !== null) {
      const n = Number(props.cache.ttlSeconds);
      if (!Number.isFinite(n) || n < 0) {
        const err = new Error('AI proposal props.cache.ttlSeconds must be a number >= 0');
        err.code = 'AI_INVALID';
        throw err;
      }
    }
  }

  if (props.timeout !== undefined && props.timeout !== null) {
    if (typeof props.timeout !== 'object' || Array.isArray(props.timeout)) {
      const err = new Error('AI proposal props.timeout must be an object');
      err.code = 'AI_INVALID';
      throw err;
    }
    if (props.timeout.value !== undefined && props.timeout.value !== null && typeof props.timeout.value !== 'string') {
      const err = new Error('AI proposal props.timeout.value must be a string');
      err.code = 'AI_INVALID';
      throw err;
    }
  }

  return { type, props };
}

function buildHelpersContextForPrompt() {
  const sb = globalThis.superbackend || globalThis.saasbackend || null;
  const services = (sb && sb.services) ? sb.services : {};
  const models = (sb && sb.models) ? sb.models : {};

  const denyServices = new Set(['globalSettings', 'migration', 'workflow']);

  const serviceKeys = Object.keys(services || {}).filter((k) => !denyServices.has(k)).sort();
  const modelKeys = Object.keys(models || {}).sort();

  return {
    denyServices: Array.from(denyServices),
    serviceKeys,
    modelKeys,
  };
}

function capList(list, max) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length <= max) return arr;
  return arr.slice(0, max);
}

function buildSystemPrompt({ helpersInfo }) {
  const servicesPreview = capList(helpersInfo.serviceKeys, 80);
  const modelsPreview = capList(helpersInfo.modelKeys, 80);

  return [
    'You are an assistant that outputs a single JSON object describing a Pages SSR Context Block.',
    'Return ONLY JSON. No markdown, no extra keys, no explanation.',
    '',
    'Output schema:',
    '{',
    '  "type": "context.db_query|context.service_invoke",',
    '  "props": { ... }',
    '}',
    '',
    'Allowed type values: context.db_query, context.service_invoke',
    '',
    'Shared props patterns:',
    '- "assignTo": string key for pageContext.vars (required)',
    '- "cache": { "enabled": boolean, "namespace"?: string, "ttlSeconds"?: number, "key"?: any } (optional)',
    '- "timeout": { "enabled": boolean, "value"?: "250ms"|"5s"|"1m" } (optional)',
    '',
    '$ctx interpolation:',
    'You can reference runtime values inside props using a JSON object with a single key "$ctx".',
    'Example: {"slug": {"$ctx": "params.slug"}}',
    '',
    'Allowed $ctx roots:',
    '- params.* (repeat params like params.slug)',
    '- query.* (req.query)',
    '- auth.*',
    '- session.*',
    '- vars.* (results from previous context blocks)',
    '- pageContext.*',
    '',
    'context.db_query props:',
    '{',
    '  "model": "MongooseModelName",',
    '  "op": "find|findOne|countDocuments",',
    '  "filter": { ... },',
    '  "sort"?: { ... },',
    '  "select"?: { ... },',
    '  "limit"?: number,',
    '  "assignTo": "post"',
    '}',
    '',
    'context.service_invoke props:',
    '{',
    '  "servicePath": "services.someService.someFn" | "models.SomeModel.someStatic" | "mongoose.someFn",',
    '  "args": [ ... ] | <any>,',
    '  "assignTo": "result"',
    '}',
    '',
    'Invokable helper namespaces:',
    '- helpers.services.<serviceName>.*',
    '- helpers.models.<ModelName>.*',
    '- helpers.mongoose.*',
    '',
    `services available (preview): ${JSON.stringify(servicesPreview)}`,
    `models available (preview): ${JSON.stringify(modelsPreview)}`,
    `services denylist (cannot be referenced): ${JSON.stringify(helpersInfo.denyServices)}`,
    '',
    'Examples:',
    '{"type":"context.db_query","props":{"model":"BlogPost","op":"findOne","filter":{"slug":{"$ctx":"params.slug"},"status":"published"},"assignTo":"post"}}',
    '{"type":"context.db_query","props":{"model":"BlogPost","op":"find","filter":{"status":"published"},"sort":{"publishedAt":-1},"limit":10,"assignTo":"latestPosts","cache":{"enabled":true,"ttlSeconds":30,"key":{"$ctx":"params.slug"}}}}',
    '{"type":"context.service_invoke","props":{"servicePath":"services.i18n.translate","args":[{"$ctx":"query.text"}],"assignTo":"t"}}',
  ].join('\n');
}

function computeWarnings({ proposal }) {
  const warnings = [];
  const props = proposal?.props || {};

  if (props.cache && props.cache.enabled && !Object.prototype.hasOwnProperty.call(props.cache, 'key')) {
    warnings.push('Caching is enabled but props.cache.key is missing; key will be auto-derived (may be OK but can reduce cache hit rate).');
  }

  if (proposal?.type === 'context.db_query') {
    const limit = props.limit;
    const n = limit === undefined || limit === null ? null : Number(limit);
    if (n !== null && Number.isFinite(n) && n > 200) {
      warnings.push('db_query limit is > 200; consider lowering it to reduce SSR latency and payload size.');
    }
  }

  if (proposal?.type === 'context.service_invoke') {
    const sp = String(props.servicePath || '');
    if (sp.startsWith('services.globalSettings') || sp.startsWith('services.migration') || sp.startsWith('services.workflow')) {
      warnings.push('servicePath references a denylisted service namespace and will fail at runtime.');
    }
  }

  return warnings;
}

async function resolveLlmDefaults({ systemKey, providerKey, model }) {
  return resolveLlmProviderModel({ systemKey, providerKey, model });
}

async function generateContextBlock({ prompt, blockType, providerKey, model, actor }) {
  const instruction = String(prompt || '').trim();
  if (!instruction) {
    const err = new Error('prompt is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const type = normalizeBlockType(blockType);
  if (!ALLOWED_BLOCK_TYPES.has(type)) {
    const err = new Error(`blockType must be one of: ${Array.from(ALLOWED_BLOCK_TYPES).join(', ')}`);
    err.code = 'VALIDATION';
    throw err;
  }

  const helpersInfo = buildHelpersContextForPrompt();

  const llmDefaults = await resolveLlmDefaults({
    systemKey: 'pageBuilder.blocks.generate',
    providerKey,
    model,
  });

  const result = await llmService.callAdhoc(
    {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      messages: [
        { role: 'system', content: buildSystemPrompt({ helpersInfo }) },
        { role: 'user', content: `Block type: ${type}\nInstruction:\n${instruction}` },
      ],
      promptKeyForAudit: 'pages.contextBlocks.ai.generate',
    },
    { temperature: 0.2 },
  );

  const raw = String(result.content || '');
  const json = parseJsonFromModelOutput(raw);
  const proposal = validateProposalShape(json);

  if (proposal.type !== type) {
    const err = new Error('AI proposal type must match requested blockType');
    err.code = 'AI_INVALID';
    throw err;
  }

  const warnings = computeWarnings({ proposal });

  await createAuditEvent({
    ...(actor || { actorType: 'system', actorId: null }),
    action: 'pages.contextBlocks.ai.generate',
    entityType: 'PagesContextBlock',
    entityId: proposal.type,
    before: null,
    after: { type: proposal.type },
    meta: {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      responsePreview: raw.slice(0, 4000),
      warnings,
    },
  });

  return {
    proposal,
    providerKey: llmDefaults.providerKey,
    model: llmDefaults.model,
    warnings,
  };
}

async function proposeContextBlockEdit({ prompt, currentBlock, providerKey, model, actor }) {
  const instruction = String(prompt || '').trim();
  if (!instruction) {
    const err = new Error('prompt is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const current = validateProposalShape(currentBlock);

  const helpersInfo = buildHelpersContextForPrompt();

  const llmDefaults = await resolveLlmDefaults({
    systemKey: 'pageBuilder.blocks.propose',
    providerKey,
    model,
  });

  const result = await llmService.callAdhoc(
    {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      messages: [
        { role: 'system', content: buildSystemPrompt({ helpersInfo }) },
        { role: 'user', content: `Instruction:\n${instruction}` },
        { role: 'user', content: `Current block:\n${JSON.stringify(current, null, 2)}` },
      ],
      promptKeyForAudit: 'pages.contextBlocks.ai.propose',
    },
    { temperature: 0.2 },
  );

  const raw = String(result.content || '');
  const json = parseJsonFromModelOutput(raw);
  const proposal = validateProposalShape(json);

  if (proposal.type !== current.type) {
    const err = new Error('AI proposal type must match currentBlock type');
    err.code = 'AI_INVALID';
    throw err;
  }

  const warnings = computeWarnings({ proposal });

  await createAuditEvent({
    ...(actor || { actorType: 'system', actorId: null }),
    action: 'pages.contextBlocks.ai.propose',
    entityType: 'PagesContextBlock',
    entityId: proposal.type,
    before: { type: current.type },
    after: { type: proposal.type },
    meta: {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      responsePreview: raw.slice(0, 4000),
      warnings,
    },
  });

  return {
    currentBlock: current,
    proposal,
    providerKey: llmDefaults.providerKey,
    model: llmDefaults.model,
    warnings,
  };
}

module.exports = {
  generateContextBlock,
  proposeContextBlockEdit,
};
