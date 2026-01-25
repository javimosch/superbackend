const HealthCheck = require('../models/HealthCheck');
const HealthCheckRun = require('../models/HealthCheckRun');
const HealthIncident = require('../models/HealthIncident');
const { runHealthCheckOnce, calculateNextRun, cleanupRunsOlderThanDays } = require('./healthChecks.service');
const notificationService = require('./notification.service');
const globalSettingsService = require('./globalSettings.service');

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

    test('handles HTTP check with bearer auth', async () => {
      const mockCheck = {
        _id: 'check-auth',
        checkType: 'http',
        httpUrl: 'https://api.test',
        httpAuth: { type: 'bearer', tokenSettingKey: 'API_TOKEN' },
        enabled: true,
        save: jest.fn().mockResolvedValue(true)
      };
      
      HealthCheck.findById.mockResolvedValue(mockCheck);
      HealthCheckRun.create.mockResolvedValue({ _id: 'run-auth' });
      globalSettingsService.getSettingValue.mockResolvedValue('secret-token');
      
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('OK'),
        ok: true
      });

      await runHealthCheckOnce('check-auth');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer secret-token' })
        })
      );
    });

    test('marks as unhealthy if status code unexpected', async () => {
      const mockCheck = {
        _id: 'check-fail',
        checkType: 'http',
        httpUrl: 'https://example.com',
        expectedStatusCodes: [200, 201],
        enabled: true,
        save: jest.fn().mockResolvedValue(true)
      };
      
      HealthCheck.findById.mockResolvedValue(mockCheck);
      HealthCheckRun.create.mockResolvedValue({ _id: 'run-fail' });
      
      global.fetch = jest.fn().mockResolvedValue({
        status: 500,
        headers: new Map(),
        text: () => Promise.resolve('Error'),
        ok: false
      });

      const result = await runHealthCheckOnce('check-fail');
      expect(result.status).toBe('unhealthy');
    });

    test('marks as unhealthy if body must match but doesn\'t', async () => {
      const mockCheck = {
        _id: 'check-body',
        checkType: 'http',
        httpUrl: 'https://example.com',
        bodyMustMatch: 'SUCCESS',
        enabled: true,
        save: jest.fn().mockResolvedValue(true)
      };
      
      HealthCheck.findById.mockResolvedValue(mockCheck);
      HealthCheckRun.create.mockResolvedValue({ _id: 'run-body' });
      
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('FAILURE'),
        ok: true
      });

      const result = await runHealthCheckOnce('check-body');
      expect(result.status).toBe('unhealthy');
    });

    test('triggers notification on incident open', async () => {
      const mockCheck = {
        _id: 'check-notify',
        name: 'Test Check',
        checkType: 'http',
        httpUrl: 'https://example.com',
        enabled: true,
        notifyOnOpen: true,
        notifyUserIds: ['u1'],
        consecutiveFailuresToOpen: 1,
        save: jest.fn().mockResolvedValue(true)
      };
      
      HealthCheck.findById.mockResolvedValue(mockCheck);
      HealthCheckRun.create.mockResolvedValue({ _id: 'run-notify' });
      HealthIncident.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
      HealthIncident.create.mockResolvedValue({ _id: 'inc1' });
      
      global.fetch = jest.fn().mockResolvedValue({
        status: 500,
        headers: new Map(),
        text: () => Promise.resolve('Error'),
        ok: false
      });

      await runHealthCheckOnce('check-notify');

      expect(notificationService.sendToUsers).toHaveBeenCalled();
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
