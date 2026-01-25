const llmService = require('../services/llm.service');

function safeJsonExtract(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  let cleaned = text;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();
  }

  const firstObj = cleaned.indexOf('{');
  const lastObj = cleaned.lastIndexOf('}');
  const firstArr = cleaned.indexOf('[');
  const lastArr = cleaned.lastIndexOf(']');

  let candidate = cleaned;
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    candidate = cleaned.slice(firstObj, lastObj + 1);
  } else if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
    candidate = cleaned.slice(firstArr, lastArr + 1);
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

exports.generateField = async (req, res) => {
  try {
    const { field, context, providerKey, model } = req.body || {};
    const f = String(field || '').trim();
    if (!f) return res.status(400).json({ error: 'field is required' });
    if (!providerKey) return res.status(400).json({ error: 'providerKey is required' });

    const ctx = context && typeof context === 'object' ? context : {};

    const system =
      'You are an expert blog editor. You write clear, concise, SEO-friendly copy. ' +
      'Return ONLY the requested output with no extra commentary.';

    const instructionsByField = {
      title: 'Generate a compelling blog post title. Keep it SEO-friendly. Max 70 characters. Return only the title.',
      excerpt: 'Generate a short excerpt (1-2 sentences). SEO-friendly, no markdown, no quotes. Return only the excerpt.',
      category: 'Suggest a single category (2-4 words). Return only the category.',
      tags: 'Generate 5-10 relevant tags. Return as a comma-separated list, lowercase where appropriate.',
      seoTitle: 'Generate an SEO title. Max 60 characters. Return only the SEO title.',
      seoDescription: 'Generate an SEO meta description. Max 155 characters. Return only the description.',
    };

    const instruction =
      instructionsByField[f] || `Generate a value for field "${f}". Return only the value.`;

    const result = await llmService.callAdhoc(
      {
        providerKey,
        model,
        promptKeyForAudit: `blog.ai.generate.${f}`,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: instruction + '\n\nContext (JSON):\n' + JSON.stringify(ctx, null, 2) },
        ],
      },
      { temperature: 0.6, max_tokens: 256 },
    );

    res.json({ value: String(result?.content || '').trim(), usage: result?.usage || null });
  } catch (error) {
    console.error('[blog-ai] generate-field error', error);
    res.status(500).json({ error: error.message || 'Failed to generate field' });
  }
};

exports.generateAll = async (req, res) => {
  try {
    const { context, providerKey, model } = req.body || {};
    if (!providerKey) return res.status(400).json({ error: 'providerKey is required' });

    const ctx = context && typeof context === 'object' ? context : {};

    const system = 'Return ONLY a valid JSON object, no markdown fences.';

    const user =
      'Generate blog metadata fields based on the blog content and context.\n' +
      'Return a JSON object with keys: title, excerpt, category, tags, seoTitle, seoDescription.\n' +
      'tags must be an array of strings.\n\n' +
      'Context (JSON):\n' +
      JSON.stringify(ctx, null, 2);

    const result = await llmService.callAdhoc(
      {
        providerKey,
        model,
        promptKeyForAudit: 'blog.ai.generate_all',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      { temperature: 0.6, max_tokens: 600 },
    );

    const parsed = safeJsonExtract(result?.content) || null;
    if (!parsed || typeof parsed !== 'object') {
      return res.status(500).json({ error: 'AI returned invalid JSON', raw: String(result?.content || '') });
    }

    if (typeof parsed.tags === 'string') {
      parsed.tags = parsed.tags
        .split(',')
        .map((t) => String(t || '').trim())
        .filter(Boolean);
    }
    if (parsed.tags !== undefined && !Array.isArray(parsed.tags)) {
      parsed.tags = [];
    }

    res.json({ values: parsed, usage: result?.usage || null });
  } catch (error) {
    console.error('[blog-ai] generate-all error', error);
    res.status(500).json({ error: error.message || 'Failed to generate all' });
  }
};

exports.formatMarkdown = async (req, res) => {
  try {
    const { text, context, providerKey, model } = req.body || {};
    if (!providerKey) return res.status(400).json({ error: 'providerKey is required' });

    const input = String(text || '');
    if (!input.trim()) return res.status(400).json({ error: 'text is required' });

    const ctx = context && typeof context === 'object' ? context : {};

    const system = 'You are an expert blog editor. Output only markdown. Do not wrap in code fences.';

    const user =
      'Convert the following content into clean, well-structured markdown with headings, lists, and short paragraphs.\n' +
      'Preserve meaning, improve readability.\n\n' +
      'Context (JSON):\n' +
      JSON.stringify(ctx, null, 2) +
      '\n\nInput:\n' +
      input;

    const result = await llmService.callAdhoc(
      {
        providerKey,
        model,
        promptKeyForAudit: 'blog.ai.format_markdown',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      { temperature: 0.4, max_tokens: 2000 },
    );

    res.json({ markdown: String(result?.content || ''), usage: result?.usage || null });
  } catch (error) {
    console.error('[blog-ai] format-markdown error', error);
    res.status(500).json({ error: error.message || 'Failed to format markdown' });
  }
};

exports.refineMarkdown = async (req, res) => {
  try {
    const { markdown, instruction, selectionStart, selectionEnd, context, providerKey, model } = req.body || {};
    if (!providerKey) return res.status(400).json({ error: 'providerKey is required' });

    const md = String(markdown || '');
    if (!md.trim()) return res.status(400).json({ error: 'markdown is required' });

    const instr = String(instruction || '').trim();
    if (!instr) return res.status(400).json({ error: 'instruction is required' });

    const ctx = context && typeof context === 'object' ? context : {};

    const start = Number(selectionStart);
    const end = Number(selectionEnd);
    const hasSelection = Number.isFinite(start) && Number.isFinite(end) && end > start;
    const selected = hasSelection ? md.slice(start, end) : '';

    const system = 'You are an expert blog editor. Output only markdown. Do not wrap in code fences.';

    const user = hasSelection
      ? 'Refine ONLY the selected markdown according to the instruction. Return ONLY the replacement markdown for the selection.\n\n' +
        'Instruction:\n' + instr +
        '\n\nContext (JSON):\n' + JSON.stringify(ctx, null, 2) +
        '\n\nSelected markdown:\n' + selected
      : 'Refine the full markdown according to the instruction. Return ONLY the full updated markdown.\n\n' +
        'Instruction:\n' + instr +
        '\n\nContext (JSON):\n' + JSON.stringify(ctx, null, 2) +
        '\n\nMarkdown:\n' + md;

    const result = await llmService.callAdhoc(
      {
        providerKey,
        model,
        promptKeyForAudit: hasSelection ? 'blog.ai.refine.selection' : 'blog.ai.refine.full',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      { temperature: 0.5, max_tokens: 2000 },
    );

    const replacement = String(result?.content || '');
    const nextMarkdown = hasSelection ? md.slice(0, start) + replacement + md.slice(end) : replacement;

    res.json({
      markdown: nextMarkdown,
      replaced: hasSelection,
      selectionStart: hasSelection ? start : null,
      selectionEnd: hasSelection ? start + replacement.length : null,
      usage: result?.usage || null,
    });
  } catch (error) {
    console.error('[blog-ai] refine-markdown error', error);
    res.status(500).json({ error: error.message || 'Failed to refine markdown' });
  }
};
