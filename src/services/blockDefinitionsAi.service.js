const BlockDefinition = require('../models/BlockDefinition');
const llmService = require('./llm.service');
const { resolveLlmProviderModel } = require('./llmDefaults.service');
const { createAuditEvent } = require('./audit.service');

function normalizeCode(code) {
  return String(code || '').trim().toLowerCase();
}

function parseJsonFromModelOutput(raw) {
  const text = String(raw || '').trim();

  // Try strict JSON first
  try {
    return JSON.parse(text);
  } catch (_) {
    // Try to extract a JSON object from a fenced block
    const m = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
    if (m) {
      return JSON.parse(String(m[1] || '').trim());
    }

    // Try first { ... } block
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

function validateProposalShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    const err = new Error('AI proposal must be a JSON object');
    err.code = 'AI_INVALID';
    throw err;
  }

  const code = normalizeCode(obj.code);
  const label = String(obj.label || '').trim();

  if (!code) {
    const err = new Error('AI proposal missing required field: code');
    err.code = 'AI_INVALID';
    throw err;
  }

  if (!label) {
    const err = new Error('AI proposal missing required field: label');
    err.code = 'AI_INVALID';
    throw err;
  }

  const fields = obj.fields;
  if (fields !== undefined && (fields === null || typeof fields !== 'object' || Array.isArray(fields))) {
    const err = new Error('AI proposal fields must be an object');
    err.code = 'AI_INVALID';
    throw err;
  }

  return {
    code,
    label,
    description: String(obj.description || ''),
    fields: fields && typeof fields === 'object' ? fields : {},
  };
}

async function resolveLlmDefaults({ systemKey, providerKey, model }) {
  return resolveLlmProviderModel({ systemKey, providerKey, model });
}

function buildSystemPrompt() {
  return [
    'You are an assistant that outputs a single JSON object describing a Page Builder block definition.',
    'Return ONLY JSON. No markdown, no extra keys, no explanation.',
    '',
    'The JSON must have shape:',
    '{',
    '  "code": "string",',
    '  "label": "string",',
    '  "description": "string",',
    '  "fields": {',
    '    "fieldName": {',
    '      "type": "string|html|boolean|number|select|json",',
    '      "label": "string",',
    '      "options": ["..."] (only for select),',
    '      "example": <any JSON value> (only for json)',
    '    }',
    '  }',
    '}',
  ].join('\n');
}

async function generateBlockDefinition({ prompt, providerKey, model, actor }) {
  const instruction = String(prompt || '').trim();
  if (!instruction) {
    const err = new Error('prompt is required');
    err.code = 'VALIDATION';
    throw err;
  }

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
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: instruction },
      ],
      promptKeyForAudit: 'pageBuilder.blocks.ai.generate',
    },
    { temperature: 0.3 },
  );

  const raw = String(result.content || '');
  const json = parseJsonFromModelOutput(raw);
  const proposal = validateProposalShape(json);

  await createAuditEvent({
    ...(actor || { actorType: 'system', actorId: null }),
    action: 'pageBuilder.blocks.ai.generate',
    entityType: 'BlockDefinition',
    entityId: proposal.code,
    before: null,
    after: { code: proposal.code },
    meta: {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      responsePreview: raw.slice(0, 4000),
    },
  });

  return {
    proposal,
    providerKey: llmDefaults.providerKey,
    model: llmDefaults.model,
  };
}

async function proposeBlockDefinitionEdit({ code, prompt, providerKey, model, actor }) {
  const blockCode = normalizeCode(code);
  if (!blockCode) {
    const err = new Error('code is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const instruction = String(prompt || '').trim();
  if (!instruction) {
    const err = new Error('prompt is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const doc = await BlockDefinition.findOne({ code: blockCode });
  if (!doc) {
    const err = new Error('Block not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const current = doc.toObject();

  const llmDefaults = await resolveLlmDefaults({
    systemKey: 'pageBuilder.blocks.propose',
    providerKey,
    model,
  });

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `Instruction:\n${instruction}` },
    {
      role: 'user',
      content: [
        'Current block definition:',
        JSON.stringify(
          {
            code: current.code,
            label: current.label,
            description: current.description,
            fields: current.fields || {},
          },
          null,
          2,
        ),
      ].join('\n'),
    },
  ];

  const result = await llmService.callAdhoc(
    {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      messages,
      promptKeyForAudit: 'pageBuilder.blocks.ai.propose',
    },
    { temperature: 0.3 },
  );

  const raw = String(result.content || '');
  const json = parseJsonFromModelOutput(raw);
  const proposal = validateProposalShape(json);

  if (proposal.code !== current.code) {
    const err = new Error('AI proposal code must match the requested block code');
    err.code = 'AI_INVALID';
    throw err;
  }

  await createAuditEvent({
    ...(actor || { actorType: 'system', actorId: null }),
    action: 'pageBuilder.blocks.ai.propose',
    entityType: 'BlockDefinition',
    entityId: current.code,
    before: { code: current.code, version: current.version },
    after: { code: current.code, version: current.version },
    meta: {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      responsePreview: raw.slice(0, 4000),
    },
  });

  return {
    block: { code: current.code, version: current.version },
    proposal,
    providerKey: llmDefaults.providerKey,
    model: llmDefaults.model,
  };
}

module.exports = {
  generateBlockDefinition,
  proposeBlockDefinitionEdit,
};
