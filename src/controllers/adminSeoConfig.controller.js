const OpenAI = require('openai');

const {
  getSeoJsonConfig,
  updateSeoJsonConfig,
  getOgSvgSettingRaw,
  setOgSvgSettingRaw,
  generateOgPng,
  getSeoconfigOpenRouterApiKey,
  getSeoconfigOpenRouterModel,
  DEFAULT_OG_PNG_OUTPUT_PATH,
} = require('../services/seoConfig.service');

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

    const apiKey = await getSeoconfigOpenRouterApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'AI is disabled (missing OpenRouter API key)' });
    }

    const model = modelOverride || (await getSeoconfigOpenRouterModel());

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });

    const prompt = buildSvgAiPrompt({ svg: svgRaw, instruction });
    const resp = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
    });

    const out = resp.choices?.[0]?.message?.content?.trim() || '';
    if (!out.startsWith('<svg') || !out.includes('</svg>')) {
      return res.status(500).json({ error: 'AI returned invalid SVG' });
    }

    return res.json({ svgRaw: out, model });
  } catch (error) {
    console.error('Error editing SVG with AI:', error);
    return res.status(500).json({ error: error?.message || 'Failed to edit SVG' });
  }
};
