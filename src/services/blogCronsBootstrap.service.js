const crypto = require('crypto');

const GlobalSetting = require('../models/GlobalSetting');
const CronJob = require('../models/CronJob');
const uploadNamespacesService = require('./uploadNamespaces.service');
const globalSettingsService = require('./globalSettings.service');

const blogAutomationService = require('./blogAutomation.service');

const INTERNAL_CRON_TOKEN_SETTING_KEY = 'blog.internalCronToken';

const CRON_NAME_AUTOMATION = 'Blog: Automation (generate drafts)';
const CRON_NAME_PUBLISH_SCHEDULED = 'Blog: Publish scheduled posts';

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

  const existingAutomation = await CronJob.findOne({ name: CRON_NAME_AUTOMATION, taskType: 'http' }).lean();
  if (!existingAutomation) {
    await CronJob.create({
      name: CRON_NAME_AUTOMATION,
      description: 'Scheduled blog automation run (disabled by default).',
      cronExpression: '0 9 * * 2,4',
      timezone: 'UTC',
      enabled: false,
      nextRunAt: null,
      taskType: 'http',
      httpMethod: 'POST',
      httpUrl: automationUrl,
      httpHeaders: [],
      httpBody: JSON.stringify({ trigger: 'scheduled' }),
      httpBodyType: 'json',
      httpAuth: { type: 'bearer', token },
      timeoutMs: 10 * 60 * 1000,
      createdBy: 'system',
    });
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
  await blogAutomationService.getBlogAutomationConfig();
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
};
