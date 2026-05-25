const BlogAutomationRun = require('../models/BlogAutomationRun');
const GlobalSetting = require('../models/GlobalSetting');

const {
  getBlogAutomationConfigById,
  getEffectiveStyleGuideForConfig,
  buildPostPrompt,
  buildImagePrompt,
} = require('./blogAutomationConfig.service');

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

async function listRuns({ limit = 30, configId } = {}) {
  const l = Math.min(100, Math.max(1, Number(limit) || 30));
  const filter = {};
  if (String(configId || '').trim()) filter.configId = String(configId).trim();
  const runs = await BlogAutomationRun.find(filter).sort({ createdAt: -1 }).limit(l).lean();
  return runs;
}

const cfg = require('./blogAutomationConfig.service');
const run = require('./blogAutomationRun.service');

module.exports = {
  ...cfg,
  ...run,
  previewPromptsByConfigId,
  listRuns,
};
