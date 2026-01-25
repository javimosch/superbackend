const fs = require('fs');
const path = require('path');

const {
  getSeoJsonConfig,
  getSeoConfigData,
  updateSeoJsonConfig,
  applySeoPageEntry,
  getOgSvgSettingRaw,
  setOgSvgSettingRaw,
  generateOgPng,
  getSeoconfigOpenRouterApiKey,
  getSeoconfigOpenRouterModel,
  DEFAULT_OG_PNG_OUTPUT_PATH,
} = require('../services/seoConfig.service');

const llmService = require('../services/llm.service');
const { resolveLlmProviderModel } = require('../services/llmDefaults.service');

function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;

  if (code === 'VALIDATION' || code === 'INVALID_JSON') {
    return res.status(400).json({ error: msg });
  }
  if (code === 'NOT_FOUND') {
    return res.status(404).json({ error: msg });
  }
  if (code === 'NO_CONVERTER') {
    return res.status(400).json({ error: msg });
  }

  return res.status(500).json({ error: msg });
}

exports.get = async (req, res) => {
  try {
    const config = await getSeoJsonConfig();
    const ogSvg = await getOgSvgSettingRaw();

    return res.json({
      config: {
        id: String(config._id),
        slug: config.slug,
        title: config.title,
        publicEnabled: Boolean(config.publicEnabled),
        cacheTtlSeconds: Number(config.cacheTtlSeconds || 0) || 0,
        jsonRaw: String(config.jsonRaw || ''),
        updatedAt: config.updatedAt,
      },
      og: {
        svgRaw: ogSvg,
        defaultPngOutputPath: DEFAULT_OG_PNG_OUTPUT_PATH,
      },
    });
  } catch (error) {
    console.error('Error fetching SEO config:', error);
    return handleServiceError(res, error);
  }
};

function validateRoutePathOrThrow(routePath) {
  const route = String(routePath || '').trim();
  if (!route || !route.startsWith('/')) {
    const err = new Error('routePath must start with /');
    err.code = 'VALIDATION';
    throw err;
  }
  return route;
}

function extractJsonCandidate(text) {
  const raw = String(text || '');
  if (!raw.trim()) return '';

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    return String(fenced[1]).trim();
  }

  const start = raw.indexOf('{');
  if (start === -1) return raw.trim();

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1).trim();
      }
    }
  }

  return raw.slice(start).trim();
}

function parseAiJsonObjectOrThrow(raw) {
  const text = extractJsonCandidate(raw);
  if (!text) {
    const err = new Error('AI returned empty response');
    err.code = 'AI_INVALID';
    throw err;
  }

  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    const err = new Error('AI returned invalid JSON');
    err.code = 'AI_INVALID';
    throw err;
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    const err = new Error('AI returned invalid entry object');
    err.code = 'AI_INVALID';
    throw err;
  }

  const title = String(obj.title || '').trim();
  const description = String(obj.description || '').trim();
  const robots = obj.robots !== undefined && obj.robots !== null ? String(obj.robots).trim() : undefined;

  if (!title) {
    const err = new Error('AI returned missing title');
    err.code = 'AI_INVALID';
    throw err;
  }
  if (!description) {
    const err = new Error('AI returned missing description');
    err.code = 'AI_INVALID';
    throw err;
  }

  const entry = { title, description };
  if (robots) entry.robots = robots;

  return entry;
}

async function listEjsFilesRecursive(rootDir, relDir = '') {
  const abs = path.join(rootDir, relDir);
  const items = await fs.promises.readdir(abs, { withFileTypes: true });
  const results = [];

  for (const item of items) {
    const name = item.name;
    if (name.startsWith('.')) continue;
    if (name === 'node_modules') continue;

    const nextRel = path.join(relDir, name);
    const nextAbs = path.join(rootDir, nextRel);

    if (item.isDirectory()) {
      const nested = await listEjsFilesRecursive(rootDir, nextRel);
      results.push(...nested);
      continue;
    }

    if (item.isFile() && name.endsWith('.ejs')) {
      results.push(nextRel.replace(/\\/g, '/'));
    }
  }

  return results;
}

exports.seoConfigAiListViews = async (req, res) => {
  try {
    const viewsRoot = path.resolve(process.cwd(), 'views');
    const views = await listEjsFilesRecursive(viewsRoot);
    views.sort();
    return res.json({ views });
  } catch (error) {
    console.error('Error listing EJS views:', error);
    return res.status(500).json({ error: 'Failed to list views' });
  }
};

function buildSeoEntryPromptFromEjs({ routePath, viewRelPath, ejsSource, siteName, baseUrl }) {
  return [
    'You are generating SEO metadata for a website page.',
    'Return ONLY valid JSON (no markdown).',
    'The JSON must be an object with keys:',
    '- title (string)',
    '- description (string)',
    '- robots (string, optional)',
    'Keep descriptions concise and marketing-friendly.',
    '',
    `Site name: ${String(siteName || '').trim()}`,
    `Base URL: ${String(baseUrl || '').trim()}`,
    `Route path: ${String(routePath || '').trim()}`,
    `View file: ${String(viewRelPath || '').trim()}`,
    '',
    'EJS source:',
    String(ejsSource || ''),
  ].join('\n');
}

exports.seoConfigAiGenerateEntry = async (req, res) => {
  try {
    const viewPath = String(req.body?.viewPath || '').trim();
    const routePath = validateRoutePathOrThrow(req.body?.routePath);
    const modelOverride = req.body?.model;
    const providerKeyOverride = req.body?.providerKey;

    if (!viewPath || !viewPath.endsWith('.ejs')) {
      return res.status(400).json({ error: 'viewPath is required and must end with .ejs' });
    }

    const viewsRoot = path.resolve(process.cwd(), 'views');
    const abs = path.resolve(viewsRoot, viewPath);
    if (!abs.startsWith(viewsRoot + path.sep) && abs !== viewsRoot) {
      return res.status(400).json({ error: 'Invalid viewPath' });
    }

    const stat = await fs.promises.stat(abs);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'viewPath must be a file' });
    }
    if (stat.size > 200_000) {
      return res.status(400).json({ error: 'view file is too large' });
    }

    const resolved = await resolveLlmProviderModel({
      systemKey: 'seoConfig.entry.generate',
      providerKey: providerKeyOverride,
      model: modelOverride,
    });

    const legacyApiKey = await getSeoconfigOpenRouterApiKey();
    const runtimeOptions = (resolved.providerKey === 'openrouter' && legacyApiKey)
      ? { apiKey: legacyApiKey, baseUrl: 'https://openrouter.ai/api/v1' }
      : {};

    const model = resolved.model || (await getSeoconfigOpenRouterModel());

    const { data } = await getSeoConfigData();
    const siteName = data?.siteName || '';
    const baseUrl = data?.baseUrl || '';

    const ejsSource = await fs.promises.readFile(abs, 'utf8');

    const prompt = buildSeoEntryPromptFromEjs({
      routePath,
      viewRelPath: viewPath,
      ejsSource,
      siteName,
      baseUrl,
    });

    const resp = await llmService.callAdhoc(
      {
        providerKey: resolved.providerKey,
        model,
        messages: [{ role: 'user', content: prompt }],
        promptKeyForAudit: 'seoConfig.entry.generate',
      },
      runtimeOptions,
    );

    const out = resp.content || '';
    const entry = parseAiJsonObjectOrThrow(out);

    return res.json({ routePath, entry, model, providerKey: resolved.providerKey });
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') {
      return res.status(400).json({ error: error.message });
    }
    if (code === 'AI_INVALID') {
      return res.status(500).json({ error: error.message });
    }
    console.error('Error generating SEO entry with AI:', error);
    return res.status(500).json({ error: error?.message || 'Failed to generate entry' });
  }
};

function buildSeoEntryPromptImprove({ routePath, existingEntry, instruction, siteName, baseUrl }) {
  return [
    'You are improving SEO metadata for a website page.',
    'Return ONLY valid JSON (no markdown).',
    'The JSON must be an object with keys:',
    '- title (string)',
    '- description (string)',
    '- robots (string, optional)',
    'Keep it consistent with the existing entry unless the instruction changes it.',
    '',
    `Site name: ${String(siteName || '').trim()}`,
    `Base URL: ${String(baseUrl || '').trim()}`,
    `Route path: ${String(routePath || '').trim()}`,
    `Instruction: ${String(instruction || '').trim()}`,
    '',
    'Existing entry JSON:',
    JSON.stringify(existingEntry || {}, null, 2),
  ].join('\n');
}

exports.seoConfigAiImproveEntry = async (req, res) => {
  try {
    const routePath = validateRoutePathOrThrow(req.body?.routePath);
    const instruction = String(req.body?.instruction || '').trim();
    const modelOverride = req.body?.model;
    const providerKeyOverride = req.body?.providerKey;

    if (!instruction) {
      return res.status(400).json({ error: 'instruction is required' });
    }
    if (instruction.length > 4_000) {
      return res.status(400).json({ error: 'instruction is too large' });
    }

    const resolved = await resolveLlmProviderModel({
      systemKey: 'seoConfig.entry.improve',
      providerKey: providerKeyOverride,
      model: modelOverride,
    });

    const legacyApiKey = await getSeoconfigOpenRouterApiKey();
    const runtimeOptions = (resolved.providerKey === 'openrouter' && legacyApiKey)
      ? { apiKey: legacyApiKey, baseUrl: 'https://openrouter.ai/api/v1' }
      : {};

    const model = resolved.model || (await getSeoconfigOpenRouterModel());

    const { data } = await getSeoConfigData();
    const siteName = data?.siteName || '';
    const baseUrl = data?.baseUrl || '';
    const existingEntry = data?.pages?.[routePath] || null;
    if (!existingEntry) {
      return res.status(404).json({ error: `No existing entry for ${routePath}` });
    }

    const prompt = buildSeoEntryPromptImprove({
      routePath,
      existingEntry,
      instruction,
      siteName,
      baseUrl,
    });

    const resp = await llmService.callAdhoc(
      {
        providerKey: resolved.providerKey,
        model,
        messages: [{ role: 'user', content: prompt }],
        promptKeyForAudit: 'seoConfig.entry.improve',
      },
      runtimeOptions,
    );

    const out = resp.content || '';
    const entry = parseAiJsonObjectOrThrow(out);

    return res.json({ routePath, entry, model, providerKey: resolved.providerKey });
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') {
      return res.status(400).json({ error: error.message });
    }
    if (code === 'AI_INVALID') {
      return res.status(500).json({ error: error.message });
    }
    console.error('Error improving SEO entry with AI:', error);
    return res.status(500).json({ error: error?.message || 'Failed to improve entry' });
  }
};

exports.seoConfigApplyEntry = async (req, res) => {
  try {
    const routePath = validateRoutePathOrThrow(req.body?.routePath);
    const entry = req.body?.entry;

    const result = await applySeoPageEntry({ routePath, entry });
    return res.json({ result });
  } catch (error) {
    console.error('Error applying SEO entry:', error);
    return handleServiceError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const patch = req.body || {};
    const updated = await updateSeoJsonConfig(patch);

    return res.json({
      config: {
        id: String(updated._id),
        slug: updated.slug,
        title: updated.title,
        publicEnabled: Boolean(updated.publicEnabled),
        cacheTtlSeconds: Number(updated.cacheTtlSeconds || 0) || 0,
        jsonRaw: String(updated.jsonRaw || ''),
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating SEO config:', error);
    return handleServiceError(res, error);
  }
};

exports.updateOgSvg = async (req, res) => {
  try {
    const svgRaw = req.body?.svgRaw;
    if (svgRaw === undefined || svgRaw === null) {
      return res.status(400).json({ error: 'svgRaw is required' });
    }

    await setOgSvgSettingRaw(svgRaw);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating OG SVG:', error);
    return handleServiceError(res, error);
  }
};

exports.generateOgPng = async (req, res) => {
  try {
    const svgRaw = req.body?.svgRaw;
    const outputPath = req.body?.outputPath || DEFAULT_OG_PNG_OUTPUT_PATH;
    const width = req.body?.width;
    const height = req.body?.height;

    if (svgRaw === undefined || svgRaw === null) {
      return res.status(400).json({ error: 'svgRaw is required' });
    }

    const result = await generateOgPng({ svgRaw, outputPath, width, height });
    return res.json({ result });
  } catch (error) {
    console.error('Error generating OG PNG:', error);
    return handleServiceError(res, error);
  }
};

function buildSvgAiPrompt({ svg, instruction }) {
  return [
    'You are editing an SVG used to generate an OpenGraph PNG image.',
    'Return only valid SVG markup (start with <svg ...> and end with </svg>).',
    'Do not include scripts. Do not include markdown fences. Do not add explanations.',
    'Keep the design compatible with 1200x630 output.',
    '',
    `Instruction: ${String(instruction || '').trim()}`,
    '',
    'Current SVG:',
    String(svg || ''),
  ].join('\n');
}

exports.aiEditSvg = async (req, res) => {
  try {
    const svgRaw = req.body?.svgRaw;
    const instruction = req.body?.instruction;
    const modelOverride = req.body?.model;
    const providerKeyOverride = req.body?.providerKey;

    if (typeof svgRaw !== 'string' || svgRaw.trim() === '') {
      return res.status(400).json({ error: 'svgRaw is required' });
    }
    if (typeof instruction !== 'string' || instruction.trim() === '') {
      return res.status(400).json({ error: 'instruction is required' });
    }

    if (svgRaw.length > 200_000) {
      return res.status(400).json({ error: 'svgRaw is too large' });
    }
    if (instruction.length > 4_000) {
      return res.status(400).json({ error: 'instruction is too large' });
    }

    const resolved = await resolveLlmProviderModel({
      systemKey: 'seoConfig.ogSvg.edit',
      providerKey: providerKeyOverride,
      model: modelOverride,
    });

    const legacyApiKey = await getSeoconfigOpenRouterApiKey();
    const runtimeOptions = (resolved.providerKey === 'openrouter' && legacyApiKey)
      ? { apiKey: legacyApiKey, baseUrl: 'https://openrouter.ai/api/v1' }
      : {};

    const model = resolved.model || (await getSeoconfigOpenRouterModel());

    const prompt = buildSvgAiPrompt({ svg: svgRaw, instruction });
    const resp = await llmService.callAdhoc(
      {
        providerKey: resolved.providerKey,
        model,
        messages: [{ role: 'user', content: prompt }],
        promptKeyForAudit: 'seoConfig.ogSvg.edit',
      },
      runtimeOptions,
    );

    const out = String(resp.content || '').trim();
    if (!out.startsWith('<svg') || !out.includes('</svg>')) {
      return res.status(500).json({ error: 'AI returned invalid SVG' });
    }

    return res.json({ svgRaw: out, model, providerKey: resolved.providerKey });
  } catch (error) {
    console.error('Error editing SVG with AI:', error);
    return res.status(500).json({ error: error?.message || 'Failed to edit SVG' });
  }
};
