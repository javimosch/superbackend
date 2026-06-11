jest.mock('mongoose', () => ({}));
jest.mock('../models/ExperimentEvent', () => ({
  deleteMany: jest.fn(),
}));
jest.mock('../models/ExperimentMetricBucket', () => ({
  deleteMany: jest.fn(),
}));
jest.mock('./globalSettings.service');
jest.mock('../models/GlobalSetting', () => ({}));

const globalSettingsService = require('./globalSettings.service');
const ExperimentEvent = require('../models/ExperimentEvent');
const ExperimentMetricBucket = require('../models/ExperimentMetricBucket');
const experimentsRetention = require('./experimentsRetention.service');

describe('experimentsRetention.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runRetentionCleanup', () => {
    test('deletes events and metrics with default retention periods', async () => {
      globalSettingsService.getSettingValue.mockImplementation(async (key, fallback) => fallback);
      ExperimentEvent.deleteMany.mockResolvedValue({ deletedCount: 10 });
      ExperimentMetricBucket.deleteMany.mockResolvedValue({ deletedCount: 5 });

      const result = await experimentsRetention.runRetentionCleanup();

      expect(result.deleted.events).toBe(10);
      expect(result.deleted.metricBuckets).toBe(5);
      expect(result.eventsRetentionDays).toBe(30);
      expect(result.metricsRetentionDays).toBe(180);
    });

    test('deletes events and metrics with custom retention from settings', async () => {
      globalSettingsService.getSettingValue.mockImplementation(async (key) => {
        if (key === 'EXPERIMENT_EVENTS_RETENTION_DAYS') return '14';
        if (key === 'EXPERIMENT_METRICS_RETENTION_DAYS') return '90';
        return null;
      });
      ExperimentEvent.deleteMany.mockResolvedValue({ deletedCount: 3 });
      ExperimentMetricBucket.deleteMany.mockResolvedValue({ deletedCount: 1 });

      const result = await experimentsRetention.runRetentionCleanup();

      expect(result.eventsRetentionDays).toBe(14);
      expect(result.metricsRetentionDays).toBe(90);
    });

    test('handles zero deleted documents', async () => {
      globalSettingsService.getSettingValue.mockImplementation(async (key, fallback) => fallback);
      ExperimentEvent.deleteMany.mockResolvedValue({ deletedCount: 0 });
      ExperimentMetricBucket.deleteMany.mockResolvedValue({ deletedCount: 0 });

      const result = await experimentsRetention.runRetentionCleanup();

      expect(result.deleted.events).toBe(0);
      expect(result.deleted.metricBuckets).toBe(0);
    });

    test('handles undefined deletedCount', async () => {
      globalSettingsService.getSettingValue.mockImplementation(async (key, fallback) => fallback);
      ExperimentEvent.deleteMany.mockResolvedValue({});
      ExperimentMetricBucket.deleteMany.mockResolvedValue({});

      const result = await experimentsRetention.runRetentionCleanup();

      expect(result.deleted.events).toBe(0);
      expect(result.deleted.metricBuckets).toBe(0);
    });

    test('deletes documents older than computed cutoff', async () => {
      globalSettingsService.getSettingValue.mockImplementation(async (key, fallback) => fallback);
      ExperimentEvent.deleteMany.mockResolvedValue({ deletedCount: 1 });
      ExperimentMetricBucket.deleteMany.mockResolvedValue({ deletedCount: 1 });

      await experimentsRetention.runRetentionCleanup();

      const eventsCall = ExperimentEvent.deleteMany.mock.calls[0][0];
      const metricsCall = ExperimentMetricBucket.deleteMany.mock.calls[0][0];

      expect(eventsCall.ts.$lt).toBeInstanceOf(Date);
      expect(metricsCall.bucketStart.$lt).toBeInstanceOf(Date);
    });

    test('calls deleteMany on both collections exactly once each', async () => {
      globalSettingsService.getSettingValue.mockImplementation(async (key, fallback) => fallback);
      ExperimentEvent.deleteMany.mockResolvedValue({ deletedCount: 1 });
      ExperimentMetricBucket.deleteMany.mockResolvedValue({ deletedCount: 1 });

      await experimentsRetention.runRetentionCleanup();

      expect(ExperimentEvent.deleteMany).toHaveBeenCalledTimes(1);
      expect(ExperimentMetricBucket.deleteMany).toHaveBeenCalledTimes(1);
    });
  });
});
