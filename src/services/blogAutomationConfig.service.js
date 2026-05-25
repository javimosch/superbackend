const crypto = require('crypto');
const BlogAutomationLock = require('../models/BlogAutomationLock');
const GlobalSetting = require('../models/GlobalSetting');
const globalSettingsService = require('./globalSettings.service');

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

async function getBlogAutomationConfigs() {
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
  normalizeAutomationConfigForSave,
  normalizeAutomationConfigItemForSave,
  buildPostPrompt,
  buildImagePrompt,
  getBlogAutomationConfig,
  getBlogAutomationConfigs,
  getBlogAutomationConfigById,
  getBlogAutomationStyleGuide,
  getEffectiveStyleGuideForConfig,
  saveBlogAutomationConfigs,
  createAutomationConfig,
  updateAutomationConfig,
  deleteAutomationConfig,
  updateStyleGuide,
};
