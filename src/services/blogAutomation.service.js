const crypto = require('crypto');
const { marked } = require('marked');

const BlogPost = require('../models/BlogPost');
const BlogAutomationRun = require('../models/BlogAutomationRun');
const BlogAutomationLock = require('../models/BlogAutomationLock');
const llmService = require('./llm.service');
const GlobalSetting = require('../models/GlobalSetting');
const globalSettingsService = require('./globalSettings.service');
const objectStorage = require('./objectStorage.service');
const uploadNamespacesService = require('./uploadNamespaces.service');
const Asset = require('../models/Asset');

const {
  extractExcerptFromMarkdown,
  generateUniqueBlogSlug,
  normalizeTags,
} = require('./blog.service');

const BLOG_AUTOMATION_CONFIG_KEY = 'blog.automation.config';
const BLOG_AUTOMATION_CONFIGS_KEY = 'blog.automation.configs';
const BLOG_AUTOMATION_STYLE_GUIDE_KEY = 'blog.automation.styleGuide';

function defaultBlogAutomationConfig() {
  return {
    enabled: false,
    runsPerDayLimit: 1,
    maxPostsPerRun: 1,
    dedupeWindowDays: 30,
    citations: { enabled: true, format: 'bullets' },
    topics: [
      { key: 'operations', label: 'Operations', weight: 4, keywords: [] },
      { key: 'micro-exits', label: 'Micro exits', weight: 4, keywords: [] },
      { key: 'saas', label: 'SaaS', weight: 3, keywords: [] },
    ],
    research: {
      providerKey: 'Perplexity',
      model: 'sonar',
      temperature: 0.2,
      maxTokens: 900,
    },
    generation: {
      providerKey: 'OpenRouter',
      model: 'google/gemini-2.5-flash-lite',
      temperature: 0.6,
      maxTokens: 2800,
    },
    textGeneration: {
      providerKey: 'OpenRouter',
      model: 'google/gemini-2.5-flash-lite',
      temperature: 0.6,
      maxTokens: 2800,
    },
    imageGeneration: {
      providerKey: 'OpenRouter',
      model: 'google/gemini-2.5-flash-image',
    },
    images: {
      enabled: false,
      maxImagesTotal: 2,
      assetNamespace: 'blog-images',
      assetVisibility: 'public',
      promptExtraInstruction: '',
      cover: {
        enabled: false,
        providerKey: 'OpenRouter',
        model: 'google/gemini-2.5-flash-image',
      },
      inline: {
        enabled: false,
        providerKey: 'OpenRouter',
        model: 'google/gemini-2.5-flash-image',
      },
    },
    dryRun: false,
  };
}

async function previewPromptsByConfigId(configId) {
  const cfg = await getBlogAutomationConfigById(configId);
  const styleGuide = await getEffectiveStyleGuideForConfig(cfg);
  const topic = Array.isArray(cfg.topics) && cfg.topics.length ? cfg.topics[0] : { key: 'topic', label: 'Topic' };
  const idea = { angle: `Example angle about ${topic.label}`, searchQuery: `Example query about ${topic.label}`, audience: 'operators' };
  const research = { summary: 'Example research summary', keyPoints: [], sources: [] };
  const ctx = { theme: topic, idea, research };
  const citationsEnabled = Boolean(cfg?.citations?.enabled);
  const title = 'Example blog post title';

  return {
    postPrompt: buildPostPrompt({ styleGuide, ctx, citationsEnabled }),
    imageCoverPrompt: buildImagePrompt({ kind: 'cover', title, extraInstruction: cfg?.images?.promptExtraInstruction }),
    imageInlinePrompt: buildImagePrompt({ kind: 'inline', title, extraInstruction: cfg?.images?.promptExtraInstruction }),
  };
}

function defaultBlogAutomationConfigs() {
  const base = defaultBlogAutomationConfig();
  return {
    version: 1,
    items: [
      {
        id: crypto.randomUUID(),
        name: 'Default',
        schedule: {
          managedBy: 'cronScheduler',
          cronExpression: '0 9 * * 2,4',
          timezone: 'UTC',
        },
        styleGuideOverride: '',
        ...base,
      },
    ],
  };
}

function defaultBlogAutomationStyleGuide() {
  return (
    'You are writing for superbackend blog readers.\n' +
    'Tone: practical, clear, direct. Avoid fluff.\n' +
    'Structure: short paragraphs, concrete steps, examples, checklists where helpful.\n' +
    'Include a short "Sources" section at the end when citations are enabled.'
  );
}

async function ensureSettingExists({ key, type, description, defaultValue }) {
  const existing = await GlobalSetting.findOne({ key }).lean();
  if (existing) return;
  await GlobalSetting.create({
    key,
    type,
    description,
    value: type === 'json' ? JSON.stringify(defaultValue) : String(defaultValue ?? ''),
    templateVariables: [],
    public: false,
  });
  globalSettingsService.clearSettingsCache();
}

function normalizeAutomationConfigForSave(cfg) {
  const base = defaultBlogAutomationConfig();
  const merged = { ...base, ...(cfg || {}) };
  merged.enabled = Boolean(merged.enabled);
  merged.runsPerDayLimit = Math.max(0, Number(merged.runsPerDayLimit || 0) || 0);
  merged.maxPostsPerRun = Math.max(1, Number(merged.maxPostsPerRun || 1) || 1);
  merged.dedupeWindowDays = Math.max(0, Number(merged.dedupeWindowDays || 0) || 0);
  if (!Array.isArray(merged.topics)) merged.topics = base.topics;
  if (!merged.citations) merged.citations = { enabled: true, format: 'bullets' };
  if (!merged.images) merged.images = base.images;

  // Backward compatibility: treat legacy `generation` as the source of truth if `textGeneration` is not present.
  if (!merged.textGeneration && merged.generation) {
    merged.textGeneration = merged.generation;
  }
  if (merged.textGeneration && !merged.generation) {
    merged.generation = merged.textGeneration;
  }
  if (!merged.imageGeneration) {
    merged.imageGeneration = base.imageGeneration;
  }
  if (merged.images && typeof merged.images === 'object') {
    merged.images.promptExtraInstruction = String(merged.images.promptExtraInstruction || '').trim();
  }

  return merged;
}

function buildPostPrompt({ styleGuide, ctx, citationsEnabled }) {
  return (
    'Write a blog post based on the research and constraints below.\n' +
    'Return JSON with keys: title, excerpt, category, tags(array), seoTitle, seoDescription, markdown.\n' +
    'Ensure markdown is complete and publish-ready.\n' +
    (citationsEnabled
      ? "Include a 'Sources' section at the end with bullet links based on sources[].\n"
      : '') +
    '\nStyle guide:\n' +
    String(styleGuide || '') +
    '\n\nContext (JSON):\n' +
    JSON.stringify(ctx || {}, null, 2)
  );
}

function buildImagePrompt({ kind, title, extraInstruction }) {
  const base =
    kind === 'cover'
      ? `Generate a clean cover image (no text) for a blog post about: ${title}.`
      : `Generate a single inline illustrative image (no text) to complement the blog post: ${title}.`;
  const extra = String(extraInstruction || '').trim();
  if (!extra) return base;
  return base + '\n\nExtra instructions:\n' + extra;
}

function normalizeAutomationConfigItemForSave(item) {
  const base = defaultBlogAutomationConfig();
  const raw = item && typeof item === 'object' ? item : {};
  const id = String(raw.id || '').trim() || crypto.randomUUID();
  const name = String(raw.name || '').trim() || 'Untitled';
  const scheduleRaw = raw.schedule && typeof raw.schedule === 'object' ? raw.schedule : {};
  const schedule = {
    managedBy: scheduleRaw.managedBy === 'manualOnly' ? 'manualOnly' : 'cronScheduler',
    cronExpression: String(scheduleRaw.cronExpression || '').trim() || '0 9 * * 2,4',
    timezone: String(scheduleRaw.timezone || '').trim() || 'UTC',
  };
  const styleGuideOverride = String(raw.styleGuideOverride || '').trim();

  const merged = normalizeAutomationConfigForSave(raw);
  return {
    id,
    name,
    schedule,
    styleGuideOverride,
    ...merged,
  };
}

async function getBlogAutomationConfigs() {
  // Ensure legacy exists to allow migration if needed
  await ensureSettingExists({
    key: BLOG_AUTOMATION_CONFIG_KEY,
    type: 'json',
    description: 'Blog automation configuration (JSON)',
    defaultValue: defaultBlogAutomationConfig(),
  });

  await ensureSettingExists({
    key: BLOG_AUTOMATION_CONFIGS_KEY,
    type: 'json',
    description: 'Blog automation configurations (JSON)',
    defaultValue: defaultBlogAutomationConfigs(),
  });

  const raw = await globalSettingsService.getSettingValue(
    BLOG_AUTOMATION_CONFIGS_KEY,
    JSON.stringify(defaultBlogAutomationConfigs()),
  );

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const items = Array.isArray(parsed?.items) ? parsed.items : null;
  if (items && items.length) {
    return {
      version: Number(parsed?.version || 1) || 1,
      items: items.map(normalizeAutomationConfigItemForSave),
    };
  }

  // Migrate from legacy single config if configs are empty/invalid
  const legacyRaw = await globalSettingsService.getSettingValue(
    BLOG_AUTOMATION_CONFIG_KEY,
    JSON.stringify(defaultBlogAutomationConfig()),
  );

  let legacy;
  try {
    legacy = JSON.parse(legacyRaw);
  } catch {
    legacy = {};
  }

  const migrated = {
    version: 1,
    items: [
      normalizeAutomationConfigItemForSave({
        id: crypto.randomUUID(),
        name: 'Default',
        schedule: {
          managedBy: 'cronScheduler',
          cronExpression: '0 9 * * 2,4',
          timezone: 'UTC',
        },
        styleGuideOverride: '',
        ...normalizeAutomationConfigForSave(legacy),
      }),
    ],
  };

  const doc = await GlobalSetting.findOne({ key: BLOG_AUTOMATION_CONFIGS_KEY });
  doc.type = 'json';
  doc.value = JSON.stringify(migrated);
  if (!doc.description) doc.description = 'Blog automation configurations (JSON)';
  await doc.save();
  globalSettingsService.clearSettingsCache();

  return migrated;
}

// Legacy single-config getter (kept for backward compatibility and migration support).
// Multi-config (`blog.automation.configs`) is the primary source of truth.
async function getBlogAutomationConfig() {
  await ensureSettingExists({
    key: BLOG_AUTOMATION_CONFIG_KEY,
    type: 'json',
    description: 'Blog automation configuration (JSON)',
    defaultValue: defaultBlogAutomationConfig(),
  });

  const raw = await globalSettingsService.getSettingValue(
    BLOG_AUTOMATION_CONFIG_KEY,
    JSON.stringify(defaultBlogAutomationConfig()),
  );

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return normalizeAutomationConfigForSave(parsed || {});
}

async function getBlogAutomationConfigById(configId) {
  const id = String(configId || '').trim();
  if (!id) {
    const err = new Error('configId is required');
    err.statusCode = 400;
    throw err;
  }
  const { items } = await getBlogAutomationConfigs();
  const found = items.find((i) => String(i.id) === id);
  if (!found) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }
  return found;
}

async function getBlogAutomationStyleGuide() {
  await ensureSettingExists({
    key: BLOG_AUTOMATION_STYLE_GUIDE_KEY,
    type: 'string',
    description: 'Blog automation writing style guide',
    defaultValue: defaultBlogAutomationStyleGuide(),
  });

  const raw = await globalSettingsService.getSettingValue(
    BLOG_AUTOMATION_STYLE_GUIDE_KEY,
    defaultBlogAutomationStyleGuide(),
  );

  return String(raw ?? '');
}

async function getEffectiveStyleGuideForConfig(config) {
  const globalGuide = await getBlogAutomationStyleGuide();
  const override = String(config?.styleGuideOverride || '').trim();
  return override ? override : globalGuide;
}

function safeJsonParseLoose(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let cleaned = raw;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();
  }
  const firstObj = cleaned.indexOf('{');
  const lastObj = cleaned.lastIndexOf('}');
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    cleaned = cleaned.slice(firstObj, lastObj + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function pickWeightedTopic(topics) {
  const usable = Array.isArray(topics) ? topics.filter((t) => t && t.key) : [];
  if (!usable.length) return { key: 'general', label: 'General', weight: 1 };

  const weights = usable.map((t) => Math.max(0, Number(t.weight || 0) || 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return usable[0];

  let r = Math.random() * sum;
  for (let i = 0; i < usable.length; i++) {
    r -= weights[i];
    if (r <= 0) return usable[i];
  }
  return usable[usable.length - 1];
}

async function acquireLock({ ttlMs = 15 * 60 * 1000 } = {}) {
  const now = new Date();
  const ownerId = crypto.randomUUID();
  const lockedUntil = new Date(Date.now() + ttlMs);
  const key = 'blog-automation';

  const doc = await BlogAutomationLock.findOneAndUpdate(
    {
      key,
      $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: { $exists: false } }],
    },
    { $set: { key, lockedUntil, ownerId } },
    { upsert: true, new: true },
  ).catch(() => null);

  if (!doc) return null;
  if (String(doc.ownerId) !== String(ownerId)) return null;
  return doc;
}

async function releaseLock(lock) {
  if (!lock?.key || !lock?.ownerId) return;
  await BlogAutomationLock.deleteOne({ key: lock.key, ownerId: lock.ownerId }).catch(() => {});
}

async function shouldSkipScheduledRun({ runsPerDayLimit }) {
  const limit = Number(runsPerDayLimit || 0);
  if (!Number.isFinite(limit) || limit <= 0) return false;

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  const count = await BlogAutomationRun.countDocuments({
    trigger: 'scheduled',
    createdAt: { $gte: start, $lte: end },
    status: { $ne: 'skipped' },
  });

  return count >= limit;
}

async function uploadBufferAsPublicAsset({ buffer, contentType, originalName, namespace, visibility }) {
  const namespaceConfig = await uploadNamespacesService.resolveNamespace(namespace);
  const hardCap = await uploadNamespacesService.getEffectiveHardCapMaxFileSizeBytes();

  const validation = uploadNamespacesService.validateUpload({
    namespaceConfig,
    contentType,
    sizeBytes: buffer.length,
    hardCapMaxFileSizeBytes: hardCap,
  });

  if (!validation.ok) {
    const err = new Error('Upload rejected by namespace policy');
    err.meta = { validation };
    throw err;
  }

  const key = uploadNamespacesService.generateObjectKey({ namespaceConfig, originalName });
  const computedVisibility = uploadNamespacesService.computeVisibility({
    namespaceConfig,
    requestedVisibility: visibility,
  });

  const { provider, bucket } = await objectStorage.putObject({
    key,
    body: buffer,
    contentType,
  });

  const asset = await Asset.create({
    key,
    provider,
    bucket,
    originalName,
    contentType,
    sizeBytes: buffer.length,
    visibility: computedVisibility,
    namespace: namespaceConfig.key,
    visibilityEnforced: Boolean(namespaceConfig.enforceVisibility),
    ownerUserId: null,
    orgId: null,
    status: 'uploaded',
    tags: [],
  });

  const publicUrl = computedVisibility === 'public' ? `/public/assets/${asset.key}` : null;

  return { asset: asset.toObject(), publicUrl };
}

async function runBlogAutomation({ trigger, configId }) {
  const cfg = await getBlogAutomationConfigById(configId);
  const styleGuide = await getEffectiveStyleGuideForConfig(cfg);

  if (!cfg.enabled) {
    const run = await BlogAutomationRun.create({
      trigger,
      status: 'skipped',
      configId: String(cfg.id),
      configSnapshot: cfg,
      error: 'Blog automation is disabled',
    });
    return run.toObject();
  }

  if (trigger === 'scheduled') {
    const skip = await shouldSkipScheduledRun({ runsPerDayLimit: cfg.runsPerDayLimit });
    if (skip) {
      const run = await BlogAutomationRun.create({
        trigger,
        status: 'skipped',
        configId: String(cfg.id),
        configSnapshot: cfg,
        error: 'runsPerDayLimit reached',
      });
      return run.toObject();
    }
  }

  const lock = await acquireLock();
  if (!lock) {
    const run = await BlogAutomationRun.create({
      trigger,
      status: 'skipped',
      configId: String(cfg.id),
      configSnapshot: cfg,
      error: 'Another run is already in progress',
    });
    return run.toObject();
  }

  const run = await BlogAutomationRun.create({
    trigger,
    status: 'running',
    startedAt: new Date(),
    configId: String(cfg.id),
    configSnapshot: cfg,
    steps: [],
    results: {},
  });

  try {
    const topic = pickWeightedTopic(cfg.topics);
    run.topic = { topicKey: topic.key, topicLabel: topic.label };
    run.steps.push({ step: 'topic', at: new Date().toISOString(), topic });

    const citationsEnabled = Boolean(cfg?.citations?.enabled);

    // Step 1: idea generation (text generation provider)
    const ideaResp = await llmService.callAdhoc(
      {
        providerKey: cfg.textGeneration.providerKey,
        model: cfg.textGeneration.model,
        promptKeyForAudit: 'blog.automation.idea',
        messages: [
          {
            role: 'system',
            content:
              'Return ONLY valid JSON (no markdown fences). You are creating a blog post idea.',
          },
          {
            role: 'user',
            content:
              'Given the theme below, propose a specific article angle and a single web research query.\n' +
              'Return JSON with keys: angle, searchQuery, audience.\n\n' +
              `Theme: ${topic.label} (${topic.key})`,
          },
        ],
      },
      { temperature: 0.6, max_tokens: 500 },
    );

    const idea =
      safeJsonParseLoose(ideaResp.content) ||
      {
        angle: `Practical lessons about ${topic.label}`,
        searchQuery: `latest insights about ${topic.label} for operators`,
        audience: 'operators',
      };

    run.steps.push({ step: 'idea', at: new Date().toISOString(), idea });

    // Step 2: research (research provider)
    const researchResp = await llmService.callAdhoc(
      {
        providerKey: cfg.research.providerKey,
        model: cfg.research.model,
        promptKeyForAudit: 'blog.automation.research',
        messages: [
          {
            role: 'system',
            content:
              'Perform web research and return ONLY valid JSON (no markdown fences). Include citations as sources[].',
          },
          {
            role: 'user',
            content:
              'Collect up-to-date information for the following query and return structured research.\n' +
              'Return JSON with keys: summary, keyPoints[], sources[] where sources items include title,url,snippet.\n\n' +
              `Query: ${idea.searchQuery}`,
          },
        ],
      },
      { temperature: cfg.research.temperature, max_tokens: cfg.research.maxTokens },
    );

    const research =
      safeJsonParseLoose(researchResp.content) ||
      {
        summary: String(researchResp.content || ''),
        keyPoints: [],
        sources: [],
      };

    run.steps.push({ step: 'research', at: new Date().toISOString(), research });

    // Step 3: generate post
    const ctx = { theme: topic, idea, research };
    const basePostPrompt = buildPostPrompt({ styleGuide, ctx, citationsEnabled });

    const postResp = await llmService.callAdhoc(
      {
        providerKey: cfg.textGeneration.providerKey,
        model: cfg.textGeneration.model,
        promptKeyForAudit: 'blog.automation.generate_post',
        messages: [
          { role: 'system', content: 'Return ONLY valid JSON (no markdown fences).' },
          { role: 'user', content: basePostPrompt },
        ],
      },
      { temperature: cfg.textGeneration.temperature, max_tokens: cfg.textGeneration.maxTokens },
    );

    let postJson = safeJsonParseLoose(postResp.content);
    let usedFallback = false;

    if (!postJson || !postJson.markdown || !postJson.title) {
      // Fallback: markdown-only
      const mdOnly = await llmService.callAdhoc(
        {
          providerKey: cfg.textGeneration.providerKey,
          model: cfg.textGeneration.model,
          promptKeyForAudit: 'blog.automation.generate_markdown_only',
          messages: [
            {
              role: 'system',
              content: 'Return ONLY markdown. Do not wrap in code fences.',
            },
            {
              role: 'user',
              content:
                'Write the full blog post in markdown.\n' +
                (citationsEnabled
                  ? "Include a 'Sources' section at the end with bullet links based on sources[].\n"
                  : '') +
                '\nStyle guide:\n' +
                styleGuide +
                '\n\nContext (JSON):\n' +
                JSON.stringify(ctx, null, 2),
            },
          ],
        },
        { temperature: cfg.textGeneration.temperature, max_tokens: cfg.textGeneration.maxTokens },
      );

      const fallbackMarkdown = String(mdOnly.content || '').trim();
      if (!fallbackMarkdown) throw new Error('LLM returned invalid blog post');

      postJson = {
        title: String(topic.label || 'Blog post'),
        excerpt: '',
        category: String(topic.label || ''),
        tags: [String(topic.key || '')].filter(Boolean),
        seoTitle: '',
        seoDescription: '',
        markdown: fallbackMarkdown,
      };
      usedFallback = true;
      run.steps.push({ step: 'generation_fallback_markdown', at: new Date().toISOString() });
    }

    let markdown = String(postJson.markdown || '');
    const title = String(postJson.title || '').trim();
    const excerpt = String(postJson.excerpt || '').trim();
    const category = String(postJson.category || '').trim();
    const tags = normalizeTags(postJson.tags);
    const seoTitle = String(postJson.seoTitle || '').trim();
    const seoDescription = String(postJson.seoDescription || '').trim();

    // Optional images
    let coverImageUrl = '';
    const createdAssetIds = [];
    const imageErrors = [];
    let hadImageError = false;

    if (cfg?.images?.enabled) {
      const namespace = String(cfg.images.assetNamespace || 'blog-images').trim();
      const visibility = String(cfg.images.assetVisibility || 'public').trim();

      const coverEnabled = Boolean(cfg?.images?.cover?.enabled);
      const inlineEnabled = Boolean(cfg?.images?.inline?.enabled);
      const maxImagesTotal = Math.max(0, Number(cfg.images.maxImagesTotal || 0) || 0);
      let imagesLeft = maxImagesTotal;

      const dataUrlRegex = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/;

      const generateImage = async ({ providerKey, model, prompt, name }) => {
        const imgResp = await llmService.callAdhoc(
          {
            providerKey,
            model,
            promptKeyForAudit: 'blog.automation.generate_image',
            messages: [
              {
                role: 'system',
                content:
                  'Return ONLY a single data URL like data:image/png;base64,... with no extra text.',
              },
              { role: 'user', content: prompt },
            ],
          },
          { temperature: 0.4, max_tokens: 2000 },
        );

        let candidate = String(imgResp.content || '').trim();
        if (candidate.startsWith('```')) {
          candidate = candidate.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();
        }

        const match = candidate.match(dataUrlRegex);
        if (!match) {
          const err = new Error('Image generation did not return a data URL');
          err.meta = { preview: candidate.slice(0, 200), providerKey, model };
          throw err;
        }

        const mime = match[1];
        const b64 = match[2];
        const buffer = Buffer.from(b64, 'base64');
        const ext = (mime.split('/')[1] || 'png').toLowerCase();

        const { asset, publicUrl } = await uploadBufferAsPublicAsset({
          buffer,
          contentType: mime,
          originalName: `${name}.${ext}`,
          namespace,
          visibility,
        });

        if (asset?._id) createdAssetIds.push(String(asset._id));
        return publicUrl;
      };

      const onImageError = (kind, error) => {
        hadImageError = true;
        imageErrors.push({ kind, message: String(error?.message || error || '') });
        run.steps.push({ step: 'image_error', at: new Date().toISOString(), kind, message: String(error?.message || error || '') });
      };

      if (coverEnabled && imagesLeft > 0) {
        try {
          coverImageUrl = await generateImage({
            providerKey: String(cfg.images.cover.providerKey || cfg.imageGeneration.providerKey || cfg.textGeneration.providerKey),
            model: String(cfg.images.cover.model || cfg.imageGeneration.model || ''),
            prompt: buildImagePrompt({ kind: 'cover', title, extraInstruction: cfg?.images?.promptExtraInstruction }),
            name: 'blog-cover',
          });
        } catch (e) {
          onImageError('cover', e);
        }
        imagesLeft -= 1;
      }

      if (inlineEnabled && imagesLeft > 0) {
        try {
          const inlineUrl = await generateImage({
            providerKey: String(cfg.images.inline.providerKey || cfg.imageGeneration.providerKey || cfg.textGeneration.providerKey),
            model: String(cfg.images.inline.model || cfg.imageGeneration.model || ''),
            prompt: buildImagePrompt({ kind: 'inline', title, extraInstruction: cfg?.images?.promptExtraInstruction }),
            name: 'blog-inline',
          });
          markdown = `\n![](${inlineUrl})\n\n` + markdown;
        } catch (e) {
          onImageError('inline', e);
        }
        imagesLeft -= 1;
      }
    }

    const html = marked.parse(markdown);
    const finalExcerpt = excerpt || extractExcerptFromMarkdown(markdown);
    const finalSlug = await generateUniqueBlogSlug(title);

    run.steps.push({
      step: 'post',
      at: new Date().toISOString(),
      title,
      slug: finalSlug,
      coverImageUrl,
      tags,
    });

    if (cfg.dryRun) {
      run.status = hadImageError || usedFallback ? 'partial' : 'succeeded';
      run.finishedAt = new Date();
      run.results = {
        dryRun: true,
        title,
        slug: finalSlug,
        coverImageUrl,
        createdAssetIds,
        imageErrors,
        usedFallback,
      };
      await run.save();
      return run.toObject();
    }

    const post = await BlogPost.create({
      title,
      slug: finalSlug,
      status: 'draft',
      excerpt: finalExcerpt,
      markdown,
      html,
      coverImageUrl,
      category,
      tags,
      authorName: 'superbackend',
      seoTitle,
      seoDescription,
      scheduledAt: null,
      publishedAt: null,
    });

    run.status = hadImageError || usedFallback ? 'partial' : 'succeeded';
    run.finishedAt = new Date();
    run.results = {
      postId: String(post._id),
      slug: post.slug,
      title: post.title,
      coverImageUrl,
      createdAssetIds,
      imageErrors,
      usedFallback,
    };
    await run.save();

    return run.toObject();
  } catch (err) {
    run.status = 'failed';
    run.finishedAt = new Date();
    run.error = String(err?.message || err || 'Unknown error');
    run.steps.push({ step: 'error', at: new Date().toISOString(), error: run.error });
    await run.save();
    return run.toObject();
  } finally {
    await releaseLock(lock);
  }
}

async function listRuns({ limit = 30, configId } = {}) {
  const l = Math.min(100, Math.max(1, Number(limit) || 30));
  const filter = {};
  if (String(configId || '').trim()) filter.configId = String(configId).trim();
  const runs = await BlogAutomationRun.find(filter).sort({ createdAt: -1 }).limit(l).lean();
  return runs;
}

async function saveBlogAutomationConfigs(configs) {
  await ensureSettingExists({
    key: BLOG_AUTOMATION_CONFIGS_KEY,
    type: 'json',
    description: 'Blog automation configurations (JSON)',
    defaultValue: defaultBlogAutomationConfigs(),
  });

  const version = Number(configs?.version || 1) || 1;
  const items = Array.isArray(configs?.items) ? configs.items : [];
  const normalized = { version, items: items.map(normalizeAutomationConfigItemForSave) };

  const doc = await GlobalSetting.findOne({ key: BLOG_AUTOMATION_CONFIGS_KEY });
  doc.type = 'json';
  doc.value = JSON.stringify(normalized);
  if (!doc.description) doc.description = 'Blog automation configurations (JSON)';
  await doc.save();
  globalSettingsService.clearSettingsCache();

  return normalized;
}

async function createAutomationConfig({ name } = {}) {
  const configs = await getBlogAutomationConfigs();
  const item = normalizeAutomationConfigItemForSave({
    id: crypto.randomUUID(),
    name: String(name || '').trim() || 'New configuration',
    schedule: {
      managedBy: 'cronScheduler',
      cronExpression: '0 9 * * 2,4',
      timezone: 'UTC',
    },
    styleGuideOverride: '',
  });

  configs.items.unshift(item);
  await saveBlogAutomationConfigs(configs);
  return item;
}

async function updateAutomationConfig(configId, patch) {
  const id = String(configId || '').trim();
  if (!id) {
    const err = new Error('configId is required');
    err.statusCode = 400;
    throw err;
  }

  const configs = await getBlogAutomationConfigs();
  const idx = configs.items.findIndex((i) => String(i.id) === id);
  if (idx === -1) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }

  const updated = normalizeAutomationConfigItemForSave({ ...configs.items[idx], ...(patch || {}), id });
  configs.items[idx] = updated;
  await saveBlogAutomationConfigs(configs);
  return updated;
}

async function deleteAutomationConfig(configId) {
  const id = String(configId || '').trim();
  if (!id) {
    const err = new Error('configId is required');
    err.statusCode = 400;
    throw err;
  }

  const configs = await getBlogAutomationConfigs();
  const before = configs.items.length;
  configs.items = configs.items.filter((i) => String(i.id) !== id);
  if (configs.items.length === before) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }
  await saveBlogAutomationConfigs(configs);
}

async function updateStyleGuide(styleGuide) {
  await ensureSettingExists({
    key: BLOG_AUTOMATION_STYLE_GUIDE_KEY,
    type: 'string',
    description: 'Blog automation writing style guide',
    defaultValue: defaultBlogAutomationStyleGuide(),
  });

  const doc = await GlobalSetting.findOne({ key: BLOG_AUTOMATION_STYLE_GUIDE_KEY });
  doc.type = 'string';
  doc.value = String(styleGuide ?? '');
  if (!doc.description) doc.description = 'Blog automation writing style guide';
  await doc.save();
  globalSettingsService.clearSettingsCache();
}

module.exports = {
  BLOG_AUTOMATION_CONFIG_KEY,
  BLOG_AUTOMATION_CONFIGS_KEY,
  BLOG_AUTOMATION_STYLE_GUIDE_KEY,
  defaultBlogAutomationConfig,
  defaultBlogAutomationConfigs,
  defaultBlogAutomationStyleGuide,
  getBlogAutomationConfig,
  getBlogAutomationConfigs,
  getBlogAutomationConfigById,
  getBlogAutomationStyleGuide,
  saveBlogAutomationConfigs,
  createAutomationConfig,
  updateAutomationConfig,
  deleteAutomationConfig,
  updateStyleGuide,
  listRuns,
  runBlogAutomation,
  previewPromptsByConfigId,
};
