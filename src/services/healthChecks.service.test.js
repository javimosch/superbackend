const HealthCheck = require('../models/HealthCheck');
const HealthCheckRun = require('../models/HealthCheckRun');
const HealthIncident = require('../models/HealthIncident');
const { runHealthCheckOnce, calculateNextRun, cleanupRunsOlderThanDays } = require('./healthChecks.service');
const notificationService = require('./notification.service');

jest.mock('../models/HealthCheck');
jest.mock('../models/HealthCheckRun');
jest.mock('../models/HealthIncident');
jest.mock('../models/HealthAutoHealAttempt');
jest.mock('./globalSettings.service');
jest.mock('./notification.service');
jest.mock('./scriptsRunner.service');

describe('healthChecks.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateNextRun', () => {
    test('calculates next run date from cron expression', () => {
      const result = calculateNextRun('0 0 * * *');
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('runHealthCheckOnce', () => {
    test('executes HTTP check and updates run document', async () => {
      const mockCheck = {
        _id: 'check123',
        checkType: 'http',
        httpUrl: 'https://example.com',
        httpMethod: 'GET',
        enabled: true,
        save: jest.fn().mockResolvedValue(true)
      };
      
      HealthCheck.findById.mockResolvedValue(mockCheck);
      HealthCheckRun.create.mockResolvedValue({ _id: 'run123' });
      HealthCheckRun.updateOne.mockResolvedValue({});
      HealthIncident.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });

      // Mock global fetch for the HTTP check
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('OK'),
        ok: true
      });

      const result = await runHealthCheckOnce('check123');

      expect(result.status).toBe('healthy');
      expect(HealthCheckRun.create).toHaveBeenCalled();
      expect(HealthCheckRun.updateOne).toHaveBeenCalled();
    });

    test('throws error if HealthCheck not found', async () => {
      HealthCheck.findById.mockResolvedValue(null);
      await expect(runHealthCheckOnce('missing')).rejects.toThrow('HealthCheck not found');
    });
  });

  describe('cleanupRunsOlderThanDays', () => {
    test('deletes old run records', async () => {
      HealthCheckRun.deleteMany.mockResolvedValue({ deletedCount: 5 });
      const result = await cleanupRunsOlderThanDays(30);
      expect(result.deletedCount).toBe(5);
      expect(HealthCheckRun.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
        startedAt: { $lt: expect.any(Date) }
      }));
    });
  });
});
