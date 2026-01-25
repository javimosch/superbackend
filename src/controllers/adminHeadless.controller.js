const {
  listModelDefinitions,
  getModelDefinitionByCode,
  createModelDefinition,
  updateModelDefinition,
  disableModelDefinition,
  getDynamicModel,
} = require('../services/headlessModels.service');

const {
  listExternalCollections,
  inferExternalModelFromCollection,
  createOrUpdateExternalModel,
} = require('../services/headlessExternalModels.service');

const llmService = require('../services/llm.service');
const { getSettingValue } = require('../services/globalSettings.service');
const { resolveLlmProviderModel } = require('../services/llmDefaults.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const axios = require('axios');
const { logAudit, scrubObject } = require('../services/auditLogger');

const {
  listApiTokens,
  getApiTokenById,
  createApiToken,
  updateApiToken,
  deleteApiToken,
} = require('../services/headlessApiTokens.service');

function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;

  if (code === 'VALIDATION') return res.status(400).json({ error: msg });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: msg });
  if (code === 'CONFLICT') return res.status(409).json({ error: msg });

  return res.status(500).json({ error: msg });
}

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'CONFLICT') return { status: 409, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return null;
  }
}

function truncateStringByBytes(value, maxBytes) {
  const str = String(value || '');
  if (!maxBytes || maxBytes <= 0) return '';
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  return buf.slice(0, maxBytes).toString('utf8');
}

function sanitizeAndTruncateMeta(value, maxBytes) {
  const scrubbed = scrubObject(value);
  let json;
  try {
    json = JSON.stringify(scrubbed);
  } catch {
    json = JSON.stringify({ error: 'Non-serializable response body' });
  }

  const buf = Buffer.from(json, 'utf8');
  if (buf.length <= maxBytes) {
    return { truncated: false, value: scrubbed };
  }

  return {
    truncated: true,
    value: {
      _truncated: true,
      _maxBytes: maxBytes,
      preview: truncateStringByBytes(json, maxBytes),
    },
  };
}

function buildLoopbackBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host');
  const basePrefix = String(req.baseUrl || '').replace(/\/api\/admin\/headless$/, '');
  return `${proto}://${host}${basePrefix}`;
}

function normalizeIndex(idx) {
  if (!idx || typeof idx !== 'object') return null;
  const fields = idx.fields;
  if (!fields || typeof fields !== 'object') return null;
  const options = idx.options && typeof idx.options === 'object' ? idx.options : {};
  return { fields, options };
}

function normalizeField(field) {
  if (!field || typeof field !== 'object') return null;
  const name = String(field.name || '').trim();
  if (!name) return null;
  const type = String(field.type || '').trim();
  if (!type) return null;
  const normalized = {
    name,
    type,
    required: Boolean(field.required),
    unique: Boolean(field.unique),
  };
  if (field.default !== undefined) normalized.default = field.default;
  if (field.validation && typeof field.validation === 'object') {
    normalized.validation = { ...field.validation };
  }
  if (field.refModelCode !== undefined && field.refModelCode !== null) {
    normalized.refModelCode = String(field.refModelCode || '').trim() || null;
  }
  return normalized;
}

function validateDefinitionShape(definition, { allowedRefModelCodes } = {}) {
  const errors = [];
  const warnings = [];

  const serverOwnedFields = [
    'version',
    'fieldsHash',
    'previousFields',
    'previousIndexes',
    'isActive',
    'createdAt',
    'updatedAt',
  ];

  const raw = definition && typeof definition === 'object' ? definition : {};
  for (const k of serverOwnedFields) {
    if (raw[k] !== undefined) {
      warnings.push(`Ignored server-owned field: ${k}`);
    }
  }

  const codeIdentifier = String(raw.codeIdentifier || '').trim();
  if (!codeIdentifier) errors.push('codeIdentifier is required');
  if (codeIdentifier && !/^[a-z][a-z0-9_]*$/.test(codeIdentifier)) {
    errors.push('codeIdentifier must match /^[a-z][a-z0-9_]*$/');
  }

  const displayName = String(raw.displayName || codeIdentifier || '').trim();
  if (!displayName) errors.push('displayName is required');

  const fieldsIn = Array.isArray(raw.fields) ? raw.fields : [];
  const fields = fieldsIn.map(normalizeField).filter(Boolean);

  const reserved = new Set(['_id', '_headlessModelCode', '_headlessSchemaVersion']);
  const names = new Set();
  for (const f of fields) {
    if (reserved.has(f.name)) {
      errors.push(`Field name is reserved: ${f.name}`);
      continue;
    }
    if (names.has(f.name)) {
      errors.push(`Duplicate field name: ${f.name}`);
      continue;
    }
    names.add(f.name);

    const type = String(f.type || '').toLowerCase();
    const isRef = type === 'ref' || type === 'reference';
    const isRefArray = type === 'ref[]' || type === 'ref_array' || type === 'refarray';

    const supported = new Set([
      'string',
      'number',
      'boolean',
      'date',
      'object',
      'array',
      'ref',
      'reference',
      'ref[]',
      'ref_array',
      'refarray',
    ]);

    if (!supported.has(type)) {
      errors.push(`Unsupported field type: ${f.type}`);
    }

    if ((isRef || isRefArray) && !String(f.refModelCode || '').trim()) {
      errors.push(`Field ${f.name} is reference type but refModelCode is missing`);
    }

    if ((isRef || isRefArray) && String(f.refModelCode || '').trim() && allowedRefModelCodes) {
      const refCode = String(f.refModelCode || '').trim();
      if (!allowedRefModelCodes.has(refCode)) {
        warnings.push(`refModelCode does not exist yet: ${refCode}`);
      }
    }

    if (f.validation && typeof f.validation === 'object') {
      const v = f.validation;
      if (v.minLength !== undefined && !Number.isFinite(Number(v.minLength))) {
        errors.push(`Field ${f.name} validation.minLength must be a number`);
      }
      if (v.maxLength !== undefined && !Number.isFinite(Number(v.maxLength))) {
        errors.push(`Field ${f.name} validation.maxLength must be a number`);
      }
      if (v.minLength !== undefined && v.maxLength !== undefined) {
        const minL = Number(v.minLength);
        const maxL = Number(v.maxLength);
        if (Number.isFinite(minL) && Number.isFinite(maxL) && minL > maxL) {
          errors.push(`Field ${f.name} validation.minLength must be <= maxLength`);
        }
      }
    }
  }

  const indexesIn = Array.isArray(raw.indexes) ? raw.indexes : [];
  const indexes = indexesIn.map(normalizeIndex).filter(Boolean);
  for (const idx of indexes) {
    if (!idx.fields || typeof idx.fields !== 'object') {
      errors.push('Index fields must be an object');
    }
  }

  const normalized = {
    codeIdentifier,
    displayName,
    description: String(raw.description || ''),
    fields,
    indexes,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

function applyPatchOpsToModel(definition, ops = []) {
  const next = {
    ...definition,
    fields: Array.isArray(definition.fields) ? [...definition.fields] : [],
    indexes: Array.isArray(definition.indexes) ? [...definition.indexes] : [],
  };

  const operations = Array.isArray(ops) ? ops : [];
  const errors = [];
  const warnings = [];

  for (const op of operations) {
    if (!op || typeof op !== 'object') continue;
    const kind = String(op.op || '').trim();

    if (kind === 'setDisplayName') {
      const value = String(op.value || '').trim();
      if (!value) errors.push('setDisplayName requires non-empty value');
      else next.displayName = value;
      continue;
    }

    if (kind === 'setDescription') {
      next.description = String(op.value || '');
      continue;
    }

    if (kind === 'addField') {
      const f = normalizeField(op.field);
      if (!f) {
        errors.push('addField requires a valid field');
        continue;
      }
      const exists = next.fields.some((x) => x && x.name === f.name);
      if (exists) {
        errors.push(`addField duplicate field: ${f.name}`);
        continue;
      }
      next.fields.push(f);
      continue;
    }

    if (kind === 'removeField') {
      const name = String(op.name || '').trim();
      if (!name) {
        errors.push('removeField requires name');
        continue;
      }
      const before = next.fields.length;
      next.fields = next.fields.filter((x) => x && x.name !== name);
      if (next.fields.length === before) warnings.push(`removeField: field not found: ${name}`);
      continue;
    }

    if (kind === 'replaceField') {
      const name = String(op.name || '').trim();
      const f = normalizeField(op.field);
      if (!name || !f) {
        errors.push('replaceField requires name and a valid field');
        continue;
      }
      const idx = next.fields.findIndex((x) => x && x.name === name);
      if (idx === -1) {
        errors.push(`replaceField: field not found: ${name}`);
        continue;
      }
      if (f.name !== name) {
        errors.push('replaceField field.name must match op.name (rename not supported)');
        continue;
      }
      next.fields[idx] = f;
      continue;
    }

    if (kind === 'addIndex') {
      const idx = normalizeIndex(op.index);
      if (!idx) {
        errors.push('addIndex requires valid index');
        continue;
      }
      next.indexes.push(idx);
      continue;
    }

    if (kind === 'removeIndex') {
      const fields = op.fields;
      if (!fields || typeof fields !== 'object') {
        errors.push('removeIndex requires fields object');
        continue;
      }
      const before = next.indexes.length;
      next.indexes = next.indexes.filter((x) => {
        if (!x || typeof x !== 'object') return false;
        try {
          return JSON.stringify(x.fields) !== JSON.stringify(fields);
        } catch {
          return true;
        }
      });
      if (next.indexes.length === before) warnings.push('removeIndex: index not found');
      continue;
    }

    warnings.push(`Unknown patch op ignored: ${kind || '(empty op)'}`);
  }

  return { next, errors, warnings };
}

exports.listModels = async (req, res) => {
  try {
    const items = await listModelDefinitions();
    return res.json({ items });
  } catch (error) {
    console.error('Error listing headless models:', error);
    return handleServiceError(res, error);
  }
};

exports.getModel = async (req, res) => {
  try {
    const item = await getModelDefinitionByCode(req.params.codeIdentifier);
    if (!item) return res.status(404).json({ error: 'Model not found' });
    return res.json({ item });
  } catch (error) {
    console.error('Error fetching headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.createModel = async (req, res) => {
  try {
    const item = await createModelDefinition(req.body || {});
    return res.status(201).json({ item });
  } catch (error) {
    console.error('Error creating headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.updateModel = async (req, res) => {
  try {
    const item = await updateModelDefinition(req.params.codeIdentifier, req.body || {});
    return res.json({ item });
  } catch (error) {
    console.error('Error updating headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.deleteModel = async (req, res) => {
  try {
    const item = await disableModelDefinition(req.params.codeIdentifier);
    return res.json({ item });
  } catch (error) {
    console.error('Error deleting headless model:', error);
    return handleServiceError(res, error);
  }
};

// External models (Mongo collections)
exports.listExternalCollections = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim() || null;
    const includeSystem = String(req.query.includeSystem || '').trim().toLowerCase() === 'true';
    const items = await listExternalCollections({ q, includeSystem });
    return res.json({ items });
  } catch (error) {
    console.error('Error listing external mongo collections:', error);
    return handleServiceError(res, error);
  }
};

exports.inferExternalCollection = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const collectionName = String(body.collectionName || '').trim();
    const sampleSize = body.sampleSize;
    const result = await inferExternalModelFromCollection({ collectionName, sampleSize });
    return res.json(result);
  } catch (error) {
    console.error('Error inferring external collection schema:', error);
    return handleServiceError(res, error);
  }
};

exports.importExternalModel = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const collectionName = String(body.collectionName || '').trim();
    const codeIdentifier = String(body.codeIdentifier || '').trim();
    const displayName = String(body.displayName || '').trim();
    const sampleSize = body.sampleSize;

    const result = await createOrUpdateExternalModel({
      collectionName,
      codeIdentifier,
      displayName,
      sampleSize,
    });

    return res.status(result.created ? 201 : 200).json({ item: result.item, inference: result.inference });
  } catch (error) {
    console.error('Error importing external model:', error);
    return handleServiceError(res, error);
  }
};

exports.syncExternalModel = async (req, res) => {
  try {
    const codeIdentifier = String(req.params.codeIdentifier || '').trim();
    const existing = await getModelDefinitionByCode(codeIdentifier);
    if (!existing) return res.status(404).json({ error: 'Model not found' });

    const isExternal = existing.sourceType === 'external' || existing.isExternal === true;
    if (!isExternal) {
      return res.status(400).json({ error: 'Model is not external' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sampleSize = body.sampleSize;

    const result = await createOrUpdateExternalModel({
      collectionName: existing.sourceCollectionName,
      codeIdentifier: existing.codeIdentifier,
      displayName: existing.displayName,
      sampleSize,
    });

    return res.json({ item: result.item, inference: result.inference });
  } catch (error) {
    console.error('Error syncing external model:', error);
    return handleServiceError(res, error);
  }
};

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
    const creates = Array.isArray(body.creates) ? body.creates : [];
    const updates = Array.isArray(body.updates) ? body.updates : [];

    const existing = await listModelDefinitions();
    const allowedRefModelCodes = new Set((existing || []).map((m) => m.codeIdentifier));
    for (const c of creates) {
      const code = String(c?.codeIdentifier || '').trim();
      if (code) allowedRefModelCodes.add(code);
    }

    const results = {
      created: [],
      updated: [],
      errors: [],
      warnings: [],
    };

    for (const def of creates) {
      const v = validateDefinitionShape(def, { allowedRefModelCodes });
      results.warnings.push(...(v.warnings || []).map((w) => `[create:${v.normalized?.codeIdentifier || '?'}] ${w}`));
      if (!v.valid) {
        results.errors.push({
          op: 'create',
          codeIdentifier: v.normalized?.codeIdentifier || null,
          errors: v.errors,
        });
        continue;
      }
      try {
        const created = await createModelDefinition(v.normalized);
        results.created.push(created);
      } catch (e) {
        results.errors.push({
          op: 'create',
          codeIdentifier: v.normalized?.codeIdentifier || null,
          error: e.message,
        });
      }
    }

    for (const up of updates) {
      const codeIdentifier = String(up?.codeIdentifier || '').trim();
      if (!codeIdentifier) {
        results.errors.push({ op: 'update', codeIdentifier: null, error: 'codeIdentifier is required' });
        continue;
      }
      let current;
      try {
        current = await getModelDefinitionByCode(codeIdentifier);
      } catch (e) {
        results.errors.push({ op: 'update', codeIdentifier, error: e.message });
        continue;
      }
      if (!current) {
        results.errors.push({ op: 'update', codeIdentifier, error: 'Model not found' });
        continue;
      }

      const { next, errors, warnings } = applyPatchOpsToModel(current, up.ops);
      results.warnings.push(...(warnings || []).map((w) => `[update:${codeIdentifier}] ${w}`));
      if (errors && errors.length) {
        results.errors.push({ op: 'update', codeIdentifier, errors });
        continue;
      }

      const v = validateDefinitionShape({ ...next, codeIdentifier }, { allowedRefModelCodes });
      results.warnings.push(...(v.warnings || []).map((w) => `[update:${codeIdentifier}] ${w}`));
      if (!v.valid) {
        results.errors.push({ op: 'update', codeIdentifier, errors: v.errors });
        continue;
      }

      try {
        const updated = await updateModelDefinition(codeIdentifier, {
          displayName: v.normalized.displayName,
          description: v.normalized.description,
          fields: v.normalized.fields,
          indexes: v.normalized.indexes,
        });
        results.updated.push(updated);
      } catch (e) {
        results.errors.push({ op: 'update', codeIdentifier, error: e.message });
      }
    }

    return res.json(results);
  } catch (error) {
    console.error('Error applying headless model proposal:', error);
    const mapped = toSafeJsonError(error);
    return res.status(mapped.status).json(mapped.body);
  }
};

exports.aiModelBuilderChat = async (req, res) => {
  try {
    const body = req.body || {};
    const message = String(body.message || '').trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const currentDefinition = body.currentDefinition && typeof body.currentDefinition === 'object'
      ? body.currentDefinition
      : null;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const existing = await listModelDefinitions();
    const allowedRefModelCodes = new Set((existing || []).map((m) => m.codeIdentifier));

    const cheatSheet = [
      'You are helping define Headless CMS models for a Mongo-backed dynamic schema system.',
      'Return STRICT JSON only (no markdown, no prose outside JSON).',
      '',
      'RESPONSE FORMAT (required):',
      '{',
      '  "assistantMessage": "Brief explanation of what you changed and why",',
      '  "proposal": {',
      '    "creates": [<modelDef>],',
      '    "updates": [{ codeIdentifier, ops: [<patchOp>] }]',
      '  },',
      '  "questions": [],',
      '  "warnings": []',
      '}',
      '',
      'EXAMPLE RESPONSE:',
      '{',
      '  "assistantMessage": "Added age field as a number with optional validation",',
      '  "proposal": {',
      '    "creates": [],',
      '    "updates": [',
      '      {',
      '        "codeIdentifier": "products",',
      '        "ops": [',
      '          {',
      '            "op": "addField",',
      '            "field": {',
      '              "name": "age",',
      '              "type": "number",',
      '              "required": false',
      '              "validation": { "min": 0, "max": 150 }',
      '            }',
      '          }',
      '        ]',
      '      }',
      '    ]',
      '  },',
      '  "questions": [],',
      '  "warnings": []',
      '}',
      '',
      'Model definition shape:',
      '{ codeIdentifier, displayName, description?, fields: [], indexes: [] }',
      '',
      'Field shape:',
      '{ name, type, required?, unique?, default?, validation?, refModelCode? }',
      '',
      'Supported field types:',
      '- string, number, boolean, date, object, array',
      '- ref (requires refModelCode)',
      '- ref[] (requires refModelCode)',
      '',
      'Supported string validation keys:',
      '- minLength, maxLength, enum, match',
      '',
      'Supported number validation keys:',
      '- min, max',
      '',
      'Model-level indexes:',
      'indexes: [{ fields: { fieldName: 1, other: -1 }, options: { unique?: true } }]',
      '',
      'Patch ops supported:',
      '- { op: "setDisplayName", value: string }',
      '- { op: "setDescription", value: string }',
      '- { op: "addField", field: <field> }',
      '- { op: "removeField", name: string }',
      '- { op: "replaceField", name: string, field: <field with same name> }',
      '- { op: "addIndex", index: <index> }',
      '- { op: "removeIndex", fields: <index fields object> }',
      '',
      'Do not include server-owned fields like version/fieldsHash/previousFields.',
      'Prefer minimal diffs: if currentDefinition exists, use updates instead of creating from scratch.',
    ].join('\n');

    const context = currentDefinition
      ? `Current model JSON (may be partial):\n${JSON.stringify(currentDefinition, null, 2)}`
      : 'Current model JSON: (none)';

    const messages = [
      { role: 'user', content: cheatSheet },
      { role: 'user', content: context },
      ...history.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      })),
      { role: 'user', content: message },
    ];

    const resolved = await resolveLlmProviderModel({
      systemKey: 'headless.modelBuilder.chat',
      providerKey: await getSettingValue('headless.aiProviderKey'),
      model: await getSettingValue('headless.aiModel'),
    });

    const providerKey = resolved.providerKey;
    const model = resolved.model;

    console.log('[headless aiModelBuilder] Resolved providerKey:', providerKey);
    console.log('[headless aiModelBuilder] Resolved model:', model);

    const llm = await llmService.callAdhoc(
      { providerKey, model, messages, promptKeyForAudit: 'headless.aiModelBuilder' },
      { temperature: 0.2 },
    );

    let parsed;
    const rawResponse = String(llm.content || '').trim();
    console.log('[headless aiModelBuilder] Raw LLM response:', rawResponse);
    
    // Audit the interaction
    const actor = getBasicAuthActor(req);
    await createAuditEvent({
      ...actor,
      action: 'headless.aiModelBuilder.chat',
      entityType: 'HeadlessModelDefinition',
      metadata: {
        providerKey,
        model,
        message,
        rawResponse,
        responseLength: rawResponse.length,
      },
    });
    
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e) {
      console.log('[headless aiModelBuilder] Direct JSON parse failed, attempting markdown extraction:', e.message);
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const extracted = jsonMatch ? jsonMatch[1].trim() : rawResponse;
      
      try {
        parsed = JSON.parse(extracted);
        console.log('[headless aiModelBuilder] Successfully parsed JSON from markdown block');
      } catch (e2) {
        console.error('[headless aiModelBuilder] JSON extraction also failed:', e2.message);
        console.error('[headless aiModelBuilder] Attempted to parse:', extracted);
        return res.status(502).json({ 
          error: 'LLM did not return valid JSON', 
          details: e.message,
          rawResponse: rawResponse.substring(0, 500) + (rawResponse.length > 500 ? '...' : '')
        });
      }
    }

    const assistantMessage = String(parsed.assistantMessage || '').trim();
    const proposal = parsed.proposal && typeof parsed.proposal === 'object' ? parsed.proposal : null;
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    if (!proposal) {
      return res.status(400).json({ error: 'LLM response missing proposal' });
    }

    const creates = Array.isArray(proposal.creates) ? proposal.creates : [];
    const updates = Array.isArray(proposal.updates) ? proposal.updates : [];

    for (const c of creates) {
      const code = String(c?.codeIdentifier || '').trim();
      if (code) allowedRefModelCodes.add(code);
    }

    const validation = { valid: true, errors: [], warnings: [] };
    for (const def of creates) {
      const v = validateDefinitionShape(def, { allowedRefModelCodes });
      validation.warnings.push(...(v.warnings || []).map((w) => `[create:${v.normalized?.codeIdentifier || '?'}] ${w}`));
      if (!v.valid) {
        validation.valid = false;
        validation.errors.push({ op: 'create', codeIdentifier: v.normalized?.codeIdentifier || null, errors: v.errors });
      }
    }

    for (const up of updates) {
      const codeIdentifier = String(up?.codeIdentifier || '').trim();
      if (!codeIdentifier) {
        validation.valid = false;
        validation.errors.push({ op: 'update', codeIdentifier: null, error: 'codeIdentifier is required' });
        continue;
      }
      const current = await getModelDefinitionByCode(codeIdentifier);
      if (!current) {
        validation.valid = false;
        validation.errors.push({ op: 'update', codeIdentifier, error: 'Model not found' });
        continue;
      }
      const { next, errors, warnings: patchWarnings } = applyPatchOpsToModel(current, up.ops);
      validation.warnings.push(...(patchWarnings || []).map((w) => `[update:${codeIdentifier}] ${w}`));
      if (errors && errors.length) {
        validation.valid = false;
        validation.errors.push({ op: 'update', codeIdentifier, errors });
        continue;
      }
      const v = validateDefinitionShape({ ...next, codeIdentifier }, { allowedRefModelCodes });
      validation.warnings.push(...(v.warnings || []).map((w) => `[update:${codeIdentifier}] ${w}`));
      if (!v.valid) {
        validation.valid = false;
        validation.errors.push({ op: 'update', codeIdentifier, errors: v.errors });
      }
    }

    return res.json({
      assistantMessage,
      proposal: { creates, updates },
      questions,
      warnings,
      validation,
    });
  } catch (error) {
    console.error('Error in AI model builder chat:', error);
    const mapped = toSafeJsonError(error);
    return res.status(mapped.status).json(mapped.body);
  }
};

// Admin collections CRUD (bypass API tokens)
exports.listCollectionItems = async (req, res) => {
  try {
    const { modelCode } = req.params;
    const Model = await getDynamicModel(modelCode);

    const limit = Math.min(Number(req.query.limit || 50) || 50, 200);
    const skip = Number(req.query.skip || 0) || 0;

    let filter = {};
    let sort = { updatedAt: -1 };

    if (req.query.filter) {
      try {
        filter = JSON.parse(String(req.query.filter));
      } catch {
        return res.status(400).json({ error: 'Invalid filter JSON' });
      }
    }

    if (req.query.sort) {
      try {
        sort = JSON.parse(String(req.query.sort));
      } catch {
        return res.status(400).json({ error: 'Invalid sort JSON' });
      }
    }

    const items = await Model.find(filter).sort(sort).skip(skip).limit(limit).lean();
    const total = await Model.countDocuments(filter);

    return res.json({ items, total, limit, skip });
  } catch (error) {
    console.error('Error listing headless collection items:', error);
    return handleServiceError(res, error);
  }
};

exports.createCollectionItem = async (req, res) => {
  try {
    const { modelCode } = req.params;
    const Model = await getDynamicModel(modelCode);

    const modelDef = await getModelDefinitionByCode(modelCode);
    if (!modelDef) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const payload = { ...req.body };
    for (const field of modelDef.fields || []) {
      if (field.required && payload[field.name] === undefined) {
        if (field.default !== undefined) {
          payload[field.name] = field.default;
        } else if (field.type === 'boolean') {
          payload[field.name] = false;
        } else if (field.type === 'number') {
          payload[field.name] = 0;
        } else if (field.type === 'date') {
          payload[field.name] = new Date();
        } else {
          payload[field.name] = '';
        }
      }
    }

    const doc = await Model.create(payload);
    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('Error creating headless collection item:', error);
    return handleServiceError(res, error);
  }
};

exports.updateCollectionItem = async (req, res) => {
  try {
    const { modelCode, id } = req.params;
    const Model = await getDynamicModel(modelCode);

    const updated = await Model.findByIdAndUpdate(id, req.body || {}, {
      new: true,
      runValidators: false,
    });

    if (!updated) return res.status(404).json({ error: 'Item not found' });
    return res.json({ item: updated.toObject() });
  } catch (error) {
    console.error('Error updating headless collection item:', error);
    return handleServiceError(res, error);
  }
};

exports.deleteCollectionItem = async (req, res) => {
  try {
    const { modelCode, id } = req.params;
    const Model = await getDynamicModel(modelCode);

    const deleted = await Model.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Item not found' });

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting headless collection item:', error);
    return handleServiceError(res, error);
  }
};

exports.executeCollectionsApiTest = async (req, res) => {
  const startedAt = Date.now();
  const MAX_META_BYTES = 10 * 1024;

  const actor = getBasicAuthActor(req);
  const payload = req.body && typeof req.body === 'object' ? req.body : {};

  const op = String(payload.op || '').trim();
  const modelCode = String(payload.modelCode || '').trim();
  const tokenType = String(payload?.auth?.type || 'bearer').trim();
  const token = String(payload?.auth?.token || '').trim();
  const pathVars = payload.pathVars && typeof payload.pathVars === 'object' ? payload.pathVars : {};
  const query = payload.query && typeof payload.query === 'object' ? payload.query : {};
  const body = payload.body && typeof payload.body === 'object' ? payload.body : undefined;

  if (!['list', 'create', 'update', 'delete'].includes(op)) {
    return res.status(400).json({ error: 'Invalid op' });
  }
  if (!modelCode || !/^[a-z][a-z0-9_]*$/.test(modelCode)) {
    return res.status(400).json({ error: 'Invalid modelCode' });
  }
  if (!token) {
    return res.status(400).json({ error: 'Missing API token' });
  }

  const id = String(pathVars.id || '').trim();
  if ((op === 'update' || op === 'delete') && !id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  let method;
  let path;
  if (op === 'list') {
    method = 'GET';
    path = `/api/headless/${encodeURIComponent(modelCode)}`;
  } else if (op === 'create') {
    method = 'POST';
    path = `/api/headless/${encodeURIComponent(modelCode)}`;
  } else if (op === 'update') {
    method = 'PUT';
    path = `/api/headless/${encodeURIComponent(modelCode)}/${encodeURIComponent(id)}`;
  } else {
    method = 'DELETE';
    path = `/api/headless/${encodeURIComponent(modelCode)}/${encodeURIComponent(id)}`;
  }

  const params = {};
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') params.limit = Number(query.limit);
  if (query.skip !== undefined && query.skip !== null && query.skip !== '') params.skip = Number(query.skip);
  if (query.populate) params.populate = String(query.populate);

  if (query.filter && typeof query.filter === 'object') {
    params.filter = JSON.stringify(query.filter);
  } else if (typeof query.filter === 'string' && query.filter.trim()) {
    const parsed = safeJsonParse(query.filter);
    if (parsed && typeof parsed === 'object') params.filter = JSON.stringify(parsed);
  }

  if (query.sort && typeof query.sort === 'object') {
    params.sort = JSON.stringify(query.sort);
  } else if (typeof query.sort === 'string' && query.sort.trim()) {
    const parsed = safeJsonParse(query.sort);
    if (parsed && typeof parsed === 'object') params.sort = JSON.stringify(parsed);
  }

  const headers = {};
  if (tokenType === 'x-api-token') headers['X-API-Token'] = token;
  else if (tokenType === 'x-api-key') headers['X-API-Key'] = token;
  else headers.Authorization = `Bearer ${token}`;

  let outcome = 'success';
  let responseStatus = 0;
  let responseHeaders = {};
  let responseBody = null;

  try {
    const base = buildLoopbackBaseUrl(req);
    const url = `${base}${path}`;

    const axiosRes = await axios.request({
      url,
      method,
      headers,
      params,
      data: op === 'create' || op === 'update' ? (body || {}) : undefined,
      timeout: 15000,
      validateStatus: () => true,
    });

    responseStatus = axiosRes.status;
    responseHeaders = axiosRes.headers || {};
    responseBody = axiosRes.data;
    if (responseStatus >= 400) outcome = 'failure';

    const durationMs = Date.now() - startedAt;
    const sanitized = sanitizeAndTruncateMeta(responseBody, MAX_META_BYTES);

    await logAudit({
      req,
      actor,
      action: 'headless.collections_api_test',
      entityType: 'headless_collection',
      entityId: modelCode,
      targetType: 'headless_collection',
      targetId: id || modelCode,
      outcome,
      meta: {
        op,
        modelCode,
        request: {
          method,
          path,
          query: scrubObject(query),
          hasBody: Boolean(op === 'create' || op === 'update'),
        },
        response: {
          status: responseStatus,
          durationMs,
          headers: {
            'content-type': responseHeaders['content-type'],
            'content-length': responseHeaders['content-length'],
            'x-request-id': responseHeaders['x-request-id'],
          },
          body: sanitized.value,
          bodyTruncated: sanitized.truncated,
        },
      },
    });

    return res.status(200).json({
      ok: responseStatus < 400,
      status: responseStatus,
      durationMs,
      headers: {
        'content-type': responseHeaders['content-type'],
        'content-length': responseHeaders['content-length'],
        'x-request-id': responseHeaders['x-request-id'],
      },
      body: responseBody,
      bodyTruncated: sanitized.truncated,
    });
  } catch (error) {
    outcome = 'failure';
    const durationMs = Date.now() - startedAt;

    await logAudit({
      req,
      actor,
      action: 'headless.collections_api_test',
      entityType: 'headless_collection',
      entityId: modelCode,
      targetType: 'headless_collection',
      targetId: id || modelCode,
      outcome,
      meta: {
        op,
        modelCode,
        request: {
          method,
          path,
          query: scrubObject(query),
          hasBody: Boolean(op === 'create' || op === 'update'),
        },
        error: {
          message: String(error?.message || 'Request failed'),
        },
        durationMs,
      },
    });

    return res.status(502).json({ error: error?.message || 'Request failed' });
  }
};

// API tokens
exports.listTokens = async (req, res) => {
  try {
    const items = await listApiTokens();
    return res.json({ items });
  } catch (error) {
    console.error('Error listing headless API tokens:', error);
    return handleServiceError(res, error);
  }
};

exports.getToken = async (req, res) => {
  try {
    const item = await getApiTokenById(req.params.id);
    if (!item) return res.status(404).json({ error: 'API token not found' });
    return res.json({ item });
  } catch (error) {
    console.error('Error fetching headless API token:', error);
    return handleServiceError(res, error);
  }
};

exports.createToken = async (req, res) => {
  try {
    const { token, item } = await createApiToken(req.body || {});
    return res.status(201).json({ token, item });
  } catch (error) {
    console.error('Error creating headless API token:', error);
    return handleServiceError(res, error);
  }
};

exports.updateToken = async (req, res) => {
  try {
    const item = await updateApiToken(req.params.id, req.body || {});
    return res.json({ item });
  } catch (error) {
    console.error('Error updating headless API token:', error);
    return handleServiceError(res, error);
  }
};

exports.deleteToken = async (req, res) => {
  try {
    const result = await deleteApiToken(req.params.id);
    return res.json(result);
  } catch (error) {
    console.error('Error deleting headless API token:', error);
    return handleServiceError(res, error);
  }
};
