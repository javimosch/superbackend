const experimentsCronsBootstrap = require('./experimentsCronsBootstrap.service');
const GlobalSetting = require('../models/GlobalSetting');
const CronJob = require('../models/CronJob');

jest.mock('../models/GlobalSetting');
jest.mock('../models/CronJob');

describe('experimentsCronsBootstrap.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    test('exports expected constants', () => {
      expect(experimentsCronsBootstrap.INTERNAL_CRON_TOKEN_SETTING_KEY).toBe('experiments.internalCronToken');
      expect(experimentsCronsBootstrap.CRON_NAME_AGGREGATE).toBe('Experiments: Aggregate + Evaluate Winner');
      expect(experimentsCronsBootstrap.CRON_NAME_RETENTION).toBe('Experiments: Retention Cleanup');
    });
  });

  describe('bootstrap', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      process.env = { ...OLD_ENV };
      delete process.env.SUPERBACKEND_BASE_URL;
      delete process.env.PUBLIC_URL;
      delete process.env.PORT;
      CronJob.updateOne = jest.fn().mockResolvedValue({});
    });

    afterEach(() => {
      process.env = OLD_ENV;
    });

    test('uses SUPERBACKEND_BASE_URL when set', async () => {
      process.env.SUPERBACKEND_BASE_URL = 'https://myapp.com';

      await experimentsCronsBootstrap.bootstrap();

      expect(CronJob.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            httpUrl: 'https://myapp.com/api/internal/experiments/aggregate/run',
          }),
        }),
        expect.anything(),
      );
    });

    test('uses PUBLIC_URL as fallback', async () => {
      process.env.PUBLIC_URL = 'https://public.example.com';

      await experimentsCronsBootstrap.bootstrap();

      expect(CronJob.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            httpUrl: 'https://public.example.com/api/internal/experiments/aggregate/run',
          }),
        }),
        expect.anything(),
      );
    });

    test('falls back to localhost when no URL is configured', async () => {
      await experimentsCronsBootstrap.bootstrap();

      expect(CronJob.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            httpUrl: 'http://localhost:3000/api/internal/experiments/aggregate/run',
          }),
        }),
        expect.anything(),
      );
    });

    test('uses PORT env var in fallback URL', async () => {
      process.env.PORT = '4000';

      await experimentsCronsBootstrap.bootstrap();

      expect(CronJob.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            httpUrl: 'http://localhost:4000/api/internal/experiments/aggregate/run',
          }),
        }),
        expect.anything(),
      );
    });

    test('strips trailing slash from base URL', async () => {
      process.env.SUPERBACKEND_BASE_URL = 'https://myapp.com/';

      await experimentsCronsBootstrap.bootstrap();

      expect(CronJob.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            httpUrl: 'https://myapp.com/api/internal/experiments/aggregate/run',
          }),
        }),
        expect.anything(),
      );
    });

    test('creates both aggregate and retention cron jobs', async () => {
      process.env.SUPERBACKEND_BASE_URL = 'https://myapp.com';

      await experimentsCronsBootstrap.bootstrap();

      expect(CronJob.updateOne).toHaveBeenCalledTimes(2);
      expect(CronJob.updateOne).toHaveBeenCalledWith(
        { name: 'Experiments: Aggregate + Evaluate Winner', taskType: 'http' },
        expect.objectContaining({
          $set: expect.objectContaining({
            cronExpression: '*/15 * * * *',
            httpUrl: 'https://myapp.com/api/internal/experiments/aggregate/run',
          }),
        }),
        { upsert: true },
      );
      expect(CronJob.updateOne).toHaveBeenCalledWith(
        { name: 'Experiments: Retention Cleanup', taskType: 'http' },
        expect.objectContaining({
          $set: expect.objectContaining({
            cronExpression: '0 3 * * *',
            httpUrl: 'https://myapp.com/api/internal/experiments/retention/run',
          }),
        }),
        { upsert: true },
      );
    });

    test('includes Basic Auth credentials from env vars', async () => {
      process.env.SUPERBACKEND_BASE_URL = 'https://myapp.com';
      process.env.ADMIN_USERNAME = 'customUser';
      process.env.ADMIN_PASSWORD = 'customPass';

      await experimentsCronsBootstrap.bootstrap();

      expect(CronJob.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            httpAuth: { type: 'basic', username: 'customUser', password: 'customPass' },
          }),
        }),
        expect.anything(),
      );
    });

    test('uses default admin credentials when env vars are not set', async () => {
      process.env.SUPERBACKEND_BASE_URL = 'https://myapp.com';
      delete process.env.ADMIN_USERNAME;
      delete process.env.ADMIN_PASSWORD;

      await experimentsCronsBootstrap.bootstrap();

      expect(CronJob.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            httpAuth: { type: 'basic', username: 'admin', password: 'admin' },
          }),
        }),
        expect.anything(),
      );
    });

    test('upserts aggregate cron job with correct structure', async () => {
      process.env.SUPERBACKEND_BASE_URL = 'https://myapp.com';

      await experimentsCronsBootstrap.bootstrap();

      const callArgs = CronJob.updateOne.mock.calls[0];
      expect(callArgs[0]).toEqual({
        name: 'Experiments: Aggregate + Evaluate Winner',
        taskType: 'http',
      });
      expect(callArgs[1].$set).toMatchObject({
        name: 'Experiments: Aggregate + Evaluate Winner',
        description: 'Aggregates experiment events into buckets and evaluates winners.',
        cronExpression: '*/15 * * * *',
        timezone: 'UTC',
        enabled: true,
        taskType: 'http',
        httpMethod: 'POST',
        httpBodyType: 'json',
        timeoutMs: 5 * 60 * 1000,
        createdBy: 'system',
      });
      expect(callArgs[1].$setOnInsert).toMatchObject({
        createdAt: expect.any(Date),
      });
      expect(callArgs[2]).toEqual({ upsert: true });
    });

    test('upserts retention cron job with correct structure', async () => {
      process.env.SUPERBACKEND_BASE_URL = 'https://myapp.com';

      await experimentsCronsBootstrap.bootstrap();

      const callArgs = CronJob.updateOne.mock.calls[1];
      expect(callArgs[0]).toEqual({
        name: 'Experiments: Retention Cleanup',
        taskType: 'http',
      });
      expect(callArgs[1].$set).toMatchObject({
        name: 'Experiments: Retention Cleanup',
        description: 'Deletes old experiment events and metric buckets based on retention settings.',
        cronExpression: '0 3 * * *',
        timezone: 'UTC',
        enabled: true,
        taskType: 'http',
        httpMethod: 'POST',
        httpBodyType: 'json',
        timeoutMs: 10 * 60 * 1000,
        createdBy: 'system',
      });
      expect(callArgs[2]).toEqual({ upsert: true });
    });
  });
});
