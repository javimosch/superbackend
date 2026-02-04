const globalSettingsService = require('./globalSettings.service');

const ExperimentEvent = require('../models/ExperimentEvent');
const ExperimentMetricBucket = require('../models/ExperimentMetricBucket');

function toInt(val, fallback) {
  const n = parseInt(String(val), 10);
  return Number.isFinite(n) ? n : fallback;
}

async function runRetentionCleanup() {
  const eventsRetentionDays = toInt(
    await globalSettingsService.getSettingValue('EXPERIMENT_EVENTS_RETENTION_DAYS', '30'),
    30,
  );
  const metricsRetentionDays = toInt(
    await globalSettingsService.getSettingValue('EXPERIMENT_METRICS_RETENTION_DAYS', '180'),
    180,
  );

  const now = Date.now();
  const eventsCutoff = new Date(now - eventsRetentionDays * 24 * 60 * 60 * 1000);
  const metricsCutoff = new Date(now - metricsRetentionDays * 24 * 60 * 60 * 1000);

  const [eventsRes, bucketsRes] = await Promise.all([
    ExperimentEvent.deleteMany({ ts: { $lt: eventsCutoff } }),
    ExperimentMetricBucket.deleteMany({ bucketStart: { $lt: metricsCutoff } }),
  ]);

  return {
    eventsRetentionDays,
    metricsRetentionDays,
    cutoffs: { eventsCutoff: eventsCutoff.toISOString(), metricsCutoff: metricsCutoff.toISOString() },
    deleted: {
      events: eventsRes?.deletedCount ?? 0,
      metricBuckets: bucketsRes?.deletedCount ?? 0,
    },
  };
}

module.exports = {
  runRetentionCleanup,
};
