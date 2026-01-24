const GlobalSetting = require('../models/GlobalSetting');
const ScriptDefinition = require('../models/ScriptDefinition');
const CronJob = require('../models/CronJob');

const globalSettingsService = require('./globalSettings.service');

const PUBLIC_STATUS_SETTING_KEY = 'healthChecks.publicStatusEnabled';

const CLEANUP_SCRIPT_CODE_IDENTIFIER = 'health-checks-cleanup-history';
const CLEANUP_CRON_NAME = 'Health Checks: Cleanup run history';

function cleanupScriptSource() {
  // This script runs out-of-process (host runner). It connects to Mongo and performs cleanup.
  return `
(async () => {
  const mongoose = require('mongoose');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI (or MONGO_URI) is required');
    process.exit(1);
  }

  const days = Number(process.env.HEALTHCHECKS_RETENTION_DAYS || 30);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 2 });

  const res = await mongoose.connection.db
    .collection('health_check_runs')
    .deleteMany({ startedAt: { $lt: cutoff } });

  console.log('Deleted', res.deletedCount || 0, 'health_check_runs older than', days, 'days');

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
`.trim();
}

async function ensurePublicStatusSettingExists() {
  const existing = await GlobalSetting.findOne({ key: PUBLIC_STATUS_SETTING_KEY }).lean();
  if (existing) return;

  await GlobalSetting.create({
    key: PUBLIC_STATUS_SETTING_KEY,
    value: 'false',
    type: 'boolean',
    description: 'Enable the public health checks status summary endpoint (/api/health-checks/status).',
    templateVariables: [],
    public: false,
  });

  globalSettingsService.clearSettingsCache();
}

async function ensureCleanupScriptExists() {
  let script = await ScriptDefinition.findOne({ codeIdentifier: CLEANUP_SCRIPT_CODE_IDENTIFIER });
  if (script) return script;

  script = await ScriptDefinition.create({
    name: 'Health Checks: Cleanup run history (> 30 days)',
    codeIdentifier: CLEANUP_SCRIPT_CODE_IDENTIFIER,
    description: 'Deletes HealthCheckRun documents older than 30 days (configurable via HEALTHCHECKS_RETENTION_DAYS env var).',
    type: 'node',
    runner: 'host',
    script: cleanupScriptSource(),
    defaultWorkingDirectory: '',
    env: [],
    timeoutMs: 5 * 60 * 1000,
    enabled: true,
  });

  return script;
}

async function ensureCleanupCronExists(scriptId) {
  const existing = await CronJob.findOne({ name: CLEANUP_CRON_NAME, taskType: 'script' }).lean();
  if (existing) return existing;

  const cron = await CronJob.create({
    name: CLEANUP_CRON_NAME,
    description: 'Weekly cleanup of health check run history (disabled by default).',
    cronExpression: '0 3 * * 0',
    timezone: 'UTC',
    enabled: false,
    nextRunAt: null,
    taskType: 'script',
    scriptId,
    scriptEnv: [],
    timeoutMs: 5 * 60 * 1000,
    createdBy: 'system',
  });

  return cron.toObject();
}

async function bootstrap() {
  await ensurePublicStatusSettingExists();
  const script = await ensureCleanupScriptExists();
  await ensureCleanupCronExists(script._id);
}

module.exports = {
  bootstrap,
  PUBLIC_STATUS_SETTING_KEY,
};
