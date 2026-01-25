const crypto = require('crypto');

const GlobalSetting = require('../models/GlobalSetting');
const CronJob = require('../models/CronJob');
const uploadNamespacesService = require('./uploadNamespaces.service');
const globalSettingsService = require('./globalSettings.service');

const blogAutomationService = require('./blogAutomation.service');

const INTERNAL_CRON_TOKEN_SETTING_KEY = 'blog.internalCronToken';

const CRON_NAME_AUTOMATION = 'Blog: Automation (generate drafts)';
const CRON_NAME_PUBLISH_SCHEDULED = 'Blog: Publish scheduled posts';

const AUTOMATION_CRON_PREFIX = 'Blog: Automation';

function getAutomationCronNameForConfigId(configId) {
  return `${AUTOMATION_CRON_PREFIX} (${String(configId)})`;
}

function getDefaultInternalCronToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function ensureSettingExists({ key, type, description, defaultValue }) {
  const existing = await GlobalSetting.findOne({ key }).lean();
  if (existing) return existing;

  const doc = await GlobalSetting.create({
    key,
    type,
    description,
    value: type === 'json' ? JSON.stringify(defaultValue) : String(defaultValue ?? ''),
    templateVariables: [],
    public: false,
  });

  globalSettingsService.clearSettingsCache();
  return doc.toObject();
}

async function ensureInternalTokenExists() {
  await ensureSettingExists({
    key: INTERNAL_CRON_TOKEN_SETTING_KEY,
    type: 'string',
    description: 'Bearer token used by CronJobs to call internal blog endpoints.',
    defaultValue: getDefaultInternalCronToken(),
  });

  const raw = await globalSettingsService.getSettingValue(
    INTERNAL_CRON_TOKEN_SETTING_KEY,
    '',
  );
  return String(raw || '').trim();
}

async function ensureBlogImagesNamespace() {
  await uploadNamespacesService.upsertNamespace('blog-images', {
    enabled: true,
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowedContentTypes: ['image/*', 'video/*', 'audio/*'],
    defaultVisibility: 'public',
    enforceVisibility: true,
  });
}

async function ensureCronJobs({ baseUrl, token }) {
  const automationUrl = `${baseUrl}/api/internal/blog/automation/run`;
  const publishUrl = `${baseUrl}/api/internal/blog/publish-scheduled/run`;

  // Reconcile per-config automation cron jobs
  const configs = await blogAutomationService.getBlogAutomationConfigs();
  const configIds = new Set((configs.items || []).map((c) => String(c.id)));

  const existingAutomationCrons = await CronJob.find({
    taskType: 'http',
    name: { $regex: `^${AUTOMATION_CRON_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(` },
  }).lean();

  for (const cron of existingAutomationCrons) {
    const name = String(cron?.name || '');
    const match = name.match(/^Blog: Automation \((.+)\)$/);
    const id = match ? String(match[1]) : '';
    if (id && !configIds.has(id)) {
      await CronJob.deleteOne({ _id: cron._id }).catch(() => {});
    }
  }

  for (const cfg of configs.items || []) {
    const id = String(cfg.id);
    const schedule = cfg && typeof cfg.schedule === 'object' ? cfg.schedule : {};
    const managedBy = schedule.managedBy === 'manualOnly' ? 'manualOnly' : 'cronScheduler';
    const cronName = getAutomationCronNameForConfigId(id);

    if (managedBy !== 'cronScheduler') {
      await CronJob.deleteOne({ name: cronName, taskType: 'http' }).catch(() => {});
      continue;
    }

    const cronExpression = String(schedule.cronExpression || '').trim() || '0 9 * * 2,4';
    const timezone = String(schedule.timezone || '').trim() || 'UTC';
    const enabled = Boolean(cfg.enabled);

    const payload = {
      name: cronName,
      description: `Scheduled blog automation run for config: ${String(cfg.name || '').trim() || id}`,
      cronExpression,
      timezone,
      enabled,
      nextRunAt: null,
      taskType: 'http',
      httpMethod: 'POST',
      httpUrl: automationUrl,
      httpHeaders: [],
      httpBody: JSON.stringify({ trigger: 'scheduled', configId: id }),
      httpBodyType: 'json',
      httpAuth: { type: 'bearer', token },
      timeoutMs: 10 * 60 * 1000,
      createdBy: 'system',
    };

    const existing = await CronJob.findOne({ name: cronName, taskType: 'http' });
    if (!existing) {
      await CronJob.create(payload);
    } else {
      existing.description = payload.description;
      existing.cronExpression = payload.cronExpression;
      existing.timezone = payload.timezone;
      existing.enabled = payload.enabled;
      existing.httpUrl = payload.httpUrl;
      existing.httpBody = payload.httpBody;
      existing.httpBodyType = payload.httpBodyType;
      existing.httpAuth = payload.httpAuth;
      existing.timeoutMs = payload.timeoutMs;
      await existing.save();
    }
  }

  const existingPublisher = await CronJob.findOne({ name: CRON_NAME_PUBLISH_SCHEDULED, taskType: 'http' }).lean();
  if (!existingPublisher) {
    await CronJob.create({
      name: CRON_NAME_PUBLISH_SCHEDULED,
      description: 'Publishes due scheduled posts (disabled by default).',
      cronExpression: '*/5 * * * *',
      timezone: 'UTC',
      enabled: false,
      nextRunAt: null,
      taskType: 'http',
      httpMethod: 'POST',
      httpUrl: publishUrl,
      httpHeaders: [],
      httpBody: JSON.stringify({}),
      httpBodyType: 'json',
      httpAuth: { type: 'bearer', token },
      timeoutMs: 2 * 60 * 1000,
      createdBy: 'system',
    });
  }
}

async function bootstrap() {
  // Ensure blog automation settings exist (config + style guide)
  await blogAutomationService.getBlogAutomationConfigs();
  await blogAutomationService.getBlogAutomationStyleGuide();

  await ensureBlogImagesNamespace();

  const token = await ensureInternalTokenExists();

  // CronScheduler HTTP jobs need an absolute base URL.
  const baseUrl =
    String(process.env.SUPERBACKEND_BASE_URL || process.env.PUBLIC_URL || '').trim() ||
    'http://localhost:3000';

  await ensureCronJobs({ baseUrl: baseUrl.replace(/\/+$/, ''), token });
}

module.exports = {
  bootstrap,
  INTERNAL_CRON_TOKEN_SETTING_KEY,
  CRON_NAME_AUTOMATION,
  CRON_NAME_PUBLISH_SCHEDULED,
  getAutomationCronNameForConfigId,
};
