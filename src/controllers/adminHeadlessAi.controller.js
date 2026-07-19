const { listModelDefinitions } = require('../services/headlessModels.service');
const llmService = require('../services/llm.service');
const { getSettingValue } = require('../services/globalSettings.service');
const { resolveLlmProviderModel } = require('../services/llmDefaults.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'CONFLICT') return { status: 409, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return res.status(400).json({ error: msg });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: msg });
  if (code === 'CONFLICT') return res.status(409).json({ error: msg });
  return res.status(500).json({ error: msg });
}

function validateDefinitionShape(definition, opts = {}) {
  if (!definition || typeof definition !== 'object') {
    return { valid: false, errors: ['definition must be an object'] };
  }
  const errors = [];
  const fields = definition.fields || [];
  if (!definition.codeIdentifier) errors.push('codeIdentifier is required');
  if (!Array.isArray(fields)) errors.push('fields must be an array');
  if (fields.length === 0) errors.push('At least one field is required');
  for (const f of fields) {
    if (!f.key) errors.push('Each field must have a key');
    if (!f.type) errors.push(`Field "${f.key || '(unnamed)'}" must have a type`);
    if (f.type === 'ref' && f.refModelCode && !opts.allowedRefModelCodes?.has(f.refModelCode)) {
      errors.push(`refModelCode "${f.refModelCode}" not found in existing models`);
    }
  }
  return { valid: errors.length === 0, errors };
}

exports.validateModelDefinition = async (req, res) => {
  try {
    const body = req.body || {};
    const definition = body.definition;
    const existing = await listModelDefinitions();
    const allowedRefModelCodes = new Set((existing || []).map((m) => m.codeIdentifier));
    const result = validateDefinitionShape(definition, { allowedRefModelCodes });
    return res.json(result);
  } catch (error) {
    console.error('Error validating headless model definition:', error);
    const mapped = toSafeJsonError(error);
    return res.status(mapped.status).json(mapped.body);
  }
};

exports.applyModelProposal = async (req, res) => {
  try {
    const body = req.body || {};
    const { fields, ...rest } = body;
    if (!rest.codeIdentifier) {
      return res.status(400).json({ error: 'codeIdentifier is required' });
    }
    const { createModelDefinition } = require('../services/headlessModels.service');
    const result = await createModelDefinition({
      ...rest,
      definition: { fields: fields || [] },
      source: 'ai_proposal',
      isActive: false,
    });
    await createAuditEvent({
      ...getBasicAuthActor(req),
      action: 'headless.model.ai_proposal',
      entityType: 'HeadlessModelDefinition',
      entityId: String(result._id),
      before: null,
      after: { codeIdentifier: rest.codeIdentifier },
      meta: null,
    });
    return res.status(201).json({ model: result });
  } catch (error) {
    console.error('Error applying model proposal:', error);
    return handleServiceError(res, error);
  }
};

exports.aiModelBuilderChat = async (req, res) => {
  try {
    const userId = req.user?._id || req.session?.authData?.userId || 'anonymous';
    const { message, existingModel, conversation } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const systemPrompt = await buildSystemPrompt(existingModel, conversation);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversation || []),
      { role: 'user', content: message },
    ];

    const llmConfig = await resolveLlmProviderModel('headless-model-builder');
    const providerKey = llmConfig?.provider || 'openai';
    const model = llmConfig?.model || 'gpt-4o-mini';

    const response = await llmService.callAdhoc({ providerKey, model, messages, promptKeyForAudit: 'headless-model-builder' });

    const assistantMessage = response?.content || '';
    const jsonBlock = extractJsonBlock(assistantMessage);

    const tokenUsage = {
      prompt: response?.usage?.prompt_tokens || 0,
      completion: response?.usage?.completion_tokens || 0,
      total: response?.usage?.total_tokens || 0,
    };

    return res.json({
      reply: assistantMessage,
      modelProposal: jsonBlock,
      usage: tokenUsage,
    });
  } catch (error) {
    console.error('[HeadlessAi] aiModelBuilderChat error:', error);
    return res.status(500).json({ error: error.message || 'AI chat failed' });
  }
};

async function buildSystemPrompt(existingModel, conversation) {
  const maxFieldsSetting = await getSettingValue('HEADLESS_AI_MAX_FIELDS', '30');
  const maxFields = parseInt(maxFieldsSetting, 10) || 30;

  const existingModels = await listModelDefinitions();
  const modelList = (existingModels || [])
    .filter((m) => m.isActive)
    .slice(0, 20)
    .map((m) => `- ${m.codeIdentifier} (${m.name || 'unnamed'})`)
    .join('\n');

  const existingDef = existingModel?.definition || {};
  const existingFields = existingDef.fields || [];

  const prompt = `You are a headless CMS model builder assistant.

Your task is to help users design data models (like database tables) for a headless CMS.

Current model: ${existingModel?.codeIdentifier || 'new model'}

Existing fields:
${existingFields.map((f) => `  - ${f.key}: ${f.type}${f.required ? ' (required)' : ''}${f.name ? ` (${f.name})` : ''}`).join('\n') || '  (none yet)'}

Existing models available for relations:${modelList ? '\n' + modelList : '\n  (none)'}

Rules:
- Maximum ${maxFields} fields per model
- Common field types: string, text, number, boolean, date, email, url, json, enum, ref (relation to another model), image, file, array, object
- Always respond with both explanation AND a JSON block containing the model proposal
- The JSON block should be wrapped in \`\`\`json ... \`\`\` markers
- Include only the fields array in the JSON block
- Each field needs: key, type, name (optional), required (boolean), defaultValue (optional), enumValues (for enum type), refModelCode (for ref type)

Be helpful, concise, and focus on practical model design.`;
  return prompt;
}

function extractJsonBlock(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      return null;
    }
  }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      return null;
    }
  }
  return null;
}

module.exports._testHelpers = {
  toSafeJsonError,
  handleServiceError,
  validateDefinitionShape,
  extractJsonBlock,
};
