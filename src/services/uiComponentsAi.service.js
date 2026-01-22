const UiComponent = require('../models/UiComponent');
const { getSettingValue } = require('./globalSettings.service');
const llmService = require('./llm.service');
const { createAuditEvent } = require('./audit.service');

const ALLOWED_FIELDS = new Set(['html', 'css', 'js', 'usageMarkdown']);

function normalizeTargets(targets) {
  const t = targets && typeof targets === 'object' ? targets : {};
  const out = {};
  for (const f of ALLOWED_FIELDS) out[f] = Boolean(t[f]);
  if (!Object.values(out).some(Boolean)) {
    // default: all
    for (const f of ALLOWED_FIELDS) out[f] = true;
  }
  return out;
}

function parseFieldPatches(raw) {
  const text = String(raw || '');
  const lines = text.split(/\r?\n/);
  const result = [];

  let current = null;
  for (const line of lines) {
    const m = line.match(/^FIELD:\s*(.+)$/);
    if (m) {
      if (current) result.push(current);
      current = { field: String(m[1] || '').trim(), content: '' };
      continue;
    }
    if (!current) continue;
    current.content += (current.content ? '\n' : '') + line;
  }
  if (current) result.push(current);

  return result;
}

function parseDiffBlocks(patchText) {
  const raw = String(patchText || '');
  const blocks = [];

  const re = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    blocks.push({ search: m[1], replace: m[2] });
  }
  return blocks;
}

function applyBlocks(currentValue, blocks) {
  let next = String(currentValue || '');

  for (const b of blocks) {
    const search = String(b.search);
    const replace = String(b.replace);

    if (search === '__FULL__') {
      next = replace;
      continue;
    }

    const idx = next.indexOf(search);
    if (idx === -1) {
      const err = new Error('SEARCH block did not match current content');
      err.code = 'AI_INVALID';
      err.meta = { searchPreview: search.slice(0, 120) };
      throw err;
    }

    next = next.replace(search, replace);
  }

  return next;
}

function computeWarnings(nextFields) {
  const warnings = [];
  const js = String(nextFields.js || '');

  const checks = [
    { token: 'eval(', msg: 'JS contains eval( which is unsafe.' },
    { token: 'document.cookie', msg: 'JS references document.cookie.' },
    { token: 'Function(', msg: 'JS contains Function( which may indicate dynamic code execution.' },
    { token: 'fetch(', msg: 'JS uses fetch(. Consider origin allowlists and error handling.' },
  ];

  for (const c of checks) {
    if (js.includes(c.token)) warnings.push(c.msg);
  }

  return warnings;
}

async function resolveLlmDefaults({ providerKey, model }) {
  const uiProvider = String(providerKey || '').trim();
  const uiModel = String(model || '').trim();

  const settingProvider = String(await getSettingValue('uiComponents.ai.providerKey', '') || '').trim();
  const settingModel = String(await getSettingValue('uiComponents.ai.model', '') || '').trim();

  const envProvider = String(process.env.DEFAULT_LLM_PROVIDER_KEY || '').trim();
  const envModel = String(process.env.DEFAULT_LLM_MODEL || '').trim();

  const resolvedProviderKey = uiProvider || settingProvider || envProvider;
  if (!resolvedProviderKey) {
    const err = new Error('Missing LLM providerKey (configure uiComponents.ai.providerKey or DEFAULT_LLM_PROVIDER_KEY, or send from UI)');
    err.code = 'VALIDATION';
    throw err;
  }

  const resolvedModel = uiModel || settingModel || envModel || 'x-ai/grok-code-fast-1';
  return { providerKey: resolvedProviderKey, model: resolvedModel };
}

function buildSystemPrompt({ targets }) {
  const allowed = Array.from(ALLOWED_FIELDS).filter((f) => targets[f]);

  return [
    'You are a code editor assistant modifying a UI component stored in a database.',
    `You may edit ONLY these fields: ${allowed.join(', ')}.`,
    'Return ONLY changes using FIELD-based SEARCH/REPLACE patches.',
    '',
    'Format:',
    'FIELD: <fieldName>',
    '<<<<<<< SEARCH',
    '[exact text to find - must match character-by-character including whitespace]',
    '=======',
    '[replacement text]',
    '>>>>>>> REPLACE',
    '',
    'Rules:',
    '- You can include multiple FIELD sections.',
    '- SEARCH must match exactly (whitespace matters).',
    '- Include enough context (5-10 lines) for unique matching.',
    '- Do not include any text outside FIELD sections and SEARCH/REPLACE blocks.',
    "- If you cannot reliably match the existing text, use SEARCH content '__FULL__' to replace the entire field.",
    '',
    'JS contract:',
    "- The component JS is executed as new Function('api','templateRootEl','props', js).",
    '- Your JS must return an object with methods.',
    '- Use templateRootEl for DOM queries (do not use document.querySelector without scoping).',
  ].join('\n');
}

async function proposeComponentEdit({
  code,
  prompt,
  providerKey,
  model,
  targets,
  mode,
  actor,
}) {
  const componentCode = String(code || '').trim().toLowerCase();
  if (!componentCode) {
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

  const targetFlags = normalizeTargets(targets);
  const allowedTargets = Object.entries(targetFlags)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const doc = await UiComponent.findOne({ code: componentCode });
  if (!doc) {
    const err = new Error('Component not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const current = doc.toObject();

  const llmDefaults = await resolveLlmDefaults({ providerKey, model });

  const systemPrompt = buildSystemPrompt({ targets: targetFlags });

  const context = {
    code: current.code,
    name: current.name,
    version: current.version,
    html: String(current.html || ''),
    css: String(current.css || ''),
    js: String(current.js || ''),
    usageMarkdown: String(current.usageMarkdown || ''),
  };

  const userContextLines = [
    `Component code: ${context.code}`,
    `Component name: ${context.name}`,
    `Component version: ${context.version}`,
    `Target fields: ${allowedTargets.join(', ')}`,
    `Mode: ${String(mode || 'minimal')}`,
    '',
    'Current fields:',
    '',
    `FIELD: html\n${context.html}`,
    '',
    `FIELD: css\n${context.css}`,
    '',
    `FIELD: js\n${context.js}`,
    '',
    `FIELD: usageMarkdown\n${context.usageMarkdown}`,
  ];

  const result = await llmService.callAdhoc(
    {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Instruction:\n${instruction}` },
        { role: 'user', content: userContextLines.join('\n') },
      ],
      promptKeyForAudit: 'uiComponents.ai.propose',
    },
    {
      temperature: String(mode || '').toLowerCase() === 'rewrite' ? 0.6 : 0.3,
    },
  );

  const raw = String(result.content || '');
  const fieldPatches = parseFieldPatches(raw);

  const patchByField = new Map();
  for (const fp of fieldPatches) {
    patchByField.set(String(fp.field || '').trim(), fp.content);
  }

  const nextFields = {
    html: context.html,
    css: context.css,
    js: context.js,
    usageMarkdown: context.usageMarkdown,
  };

  const appliedFields = [];

  for (const field of ALLOWED_FIELDS) {
    if (!targetFlags[field]) continue;
    const patchText = patchByField.get(field);
    if (!patchText) continue;

    const blocks = parseDiffBlocks(patchText);
    if (!blocks.length) {
      const err = new Error(`No diff blocks found for field ${field}`);
      err.code = 'AI_INVALID';
      throw err;
    }

    nextFields[field] = applyBlocks(nextFields[field], blocks);
    appliedFields.push(field);
  }

  if (!appliedFields.length) {
    const err = new Error('No applicable field patches returned');
    err.code = 'AI_INVALID';
    throw err;
  }

  const warnings = computeWarnings(nextFields);

  await createAuditEvent({
    ...(actor || { actorType: 'system', actorId: null }),
    action: 'uiComponents.ai.propose',
    entityType: 'UiComponent',
    entityId: componentCode,
    before: {
      code: current.code,
      version: current.version,
    },
    after: {
      code: current.code,
      version: current.version,
      appliedFields,
    },
    meta: {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      targets: targetFlags,
      mode: String(mode || 'minimal'),
      warnings,
      patchPreview: raw.slice(0, 4000),
    },
  });

  return {
    component: { code: current.code, version: current.version },
    proposal: {
      patch: raw,
      fields: nextFields,
      appliedFields,
      warnings,
    },
    providerKey: llmDefaults.providerKey,
    model: llmDefaults.model,
  };
}

module.exports = {
  proposeComponentEdit,
};
