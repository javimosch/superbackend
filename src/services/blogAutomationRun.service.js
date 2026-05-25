const crypto = require('crypto');
const { marked } = require('marked');

const BlogPost = require('../models/BlogPost');
const BlogAutomationRun = require('../models/BlogAutomationRun');
const BlogAutomationLock = require('../models/BlogAutomationLock');
const Asset = require('../models/Asset');
const llmService = require('./llm.service');
const objectStorage = require('./objectStorage.service');
const uploadNamespacesService = require('./uploadNamespaces.service');
const {
  extractExcerptFromMarkdown,
  generateUniqueBlogSlug,
  normalizeTags,
} = require('./blog.service');

const {
  getBlogAutomationConfigById,
  getEffectiveStyleGuideForConfig,
  buildPostPrompt,
  buildImagePrompt,
} = require('./blogAutomationConfig.service');

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

module.exports = {
  runBlogAutomation,
};
