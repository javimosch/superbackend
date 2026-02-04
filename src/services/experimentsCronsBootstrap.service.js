const crypto = require('crypto');

const GlobalSetting = require('../models/GlobalSetting');
const CronJob = require('../models/CronJob');

const globalSettingsService = require('./globalSettings.service');

const INTERNAL_CRON_TOKEN_SETTING_KEY = 'experiments.internalCronToken';

const CRON_NAME_AGGREGATE = 'Experiments: Aggregate + Evaluate Winner';
const CRON_NAME_RETENTION = 'Experiments: Retention Cleanup';

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
    description: 'Bearer token used by CronJobs to call internal experiments endpoints.',
    defaultValue: getDefaultInternalCronToken(),
  });

  const raw = await globalSettingsService.getSettingValue(INTERNAL_CRON_TOKEN_SETTING_KEY, '');
  return String(raw || '').trim();
}

async function ensureCronJobs({ baseUrl }) {
  const aggregateUrl = `${baseUrl}/api/internal/experiments/aggregate/run`;
  const retentionUrl = `${baseUrl}/api/internal/experiments/retention/run`;

  // Use the same Basic Auth credentials as the admin API.
  // This keeps a single source of truth and avoids CronJobs drifting to other env vars.
  const internalCronUsername = process.env.ADMIN_USERNAME || 'admin';
  const internalCronPassword = process.env.ADMIN_PASSWORD || 'admin';

  const aggDoc = {
    name: CRON_NAME_AGGREGATE,
    description: 'Aggregates experiment events into buckets and evaluates winners.',
    cronExpression: '*/15 * * * *',
    timezone: 'UTC',
    enabled: true,
    nextRunAt: null,
    taskType: 'http',
    httpMethod: 'POST',
    httpUrl: aggregateUrl,
    httpHeaders: [],
    httpBody: JSON.stringify({}),
    httpBodyType: 'json',
    httpAuth: { type: 'basic', username: internalCronUsername, password: internalCronPassword },
    timeoutMs: 5 * 60 * 1000,
    createdBy: 'system',
  };

  await CronJob.updateOne(
    { name: CRON_NAME_AGGREGATE, taskType: 'http' },
    { $set: aggDoc, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );

  const retentionDoc = {
    name: CRON_NAME_RETENTION,
    description: 'Deletes old experiment events and metric buckets based on retention settings.',
    cronExpression: '0 3 * * *',
    timezone: 'UTC',
    enabled: true,
    nextRunAt: null,
    taskType: 'http',
    httpMethod: 'POST',
    httpUrl: retentionUrl,
    httpHeaders: [],
    httpBody: JSON.stringify({}),
    httpBodyType: 'json',
    httpAuth: { type: 'basic', username: internalCronUsername, password: internalCronPassword },
    timeoutMs: 10 * 60 * 1000,
    createdBy: 'system',
  };

  await CronJob.updateOne(
    { name: CRON_NAME_RETENTION, taskType: 'http' },
    { $set: retentionDoc, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}

async function bootstrap() {
  // CronScheduler HTTP jobs need an absolute base URL.
  const baseUrl =
    String(process.env.SUPERBACKEND_BASE_URL || process.env.PUBLIC_URL || '').trim() ||
    'http://localhost:3000';

  await ensureCronJobs({ baseUrl: baseUrl.replace(/\/+$/, '') });
}

module.exports = {
  bootstrap,
  INTERNAL_CRON_TOKEN_SETTING_KEY,
  CRON_NAME_AGGREGATE,
  CRON_NAME_RETENTION,
};
