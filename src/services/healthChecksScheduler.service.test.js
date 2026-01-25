const cron = require('node-cron');
const HealthCheck = require('../models/HealthCheck');
const healthChecksService = require('./healthChecks.service');
const healthChecksScheduler = require('./healthChecksScheduler.service');

jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    start: jest.fn(),
    stop: jest.fn()
  }),
  validate: jest.fn().mockReturnValue(true)
}));

jest.mock('../models/HealthCheck', () => ({
  find: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('./healthChecks.service', () => ({
  runHealthCheckOnce: jest.fn()
}));

describe('healthChecksScheduler.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    healthChecksScheduler.scheduledChecks.clear();
    healthChecksScheduler.isRunning = false;
  });

  describe('start', () => {
    test('loads enabled checks and schedules them', async () => {
      const mockChecks = [
        { _id: 'check1', name: 'Check 1', cronExpression: '* * * * *', enabled: true },
        { _id: 'check2', name: 'Check 2', cronExpression: '0 0 * * *', enabled: true }
      ];
      HealthCheck.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockChecks) });
      
      await healthChecksScheduler.start();

      expect(healthChecksScheduler.isRunning).toBe(true);
      expect(cron.schedule).toHaveBeenCalledTimes(2);
      expect(healthChecksScheduler.scheduledChecks.size).toBe(2);
    });

    test('does nothing if already running', async () => {
      healthChecksScheduler.isRunning = true;
      await healthChecksScheduler.start();
      expect(HealthCheck.find).not.toHaveBeenCalled();
    });
  });

  describe('scheduleCheck', () => {
    test('schedules a check and updates nextRunAt', async () => {
      const mockCheck = { _id: 'check123', name: 'Test', cronExpression: '*/5 * * * *' };
      
      await healthChecksScheduler.scheduleCheck(mockCheck);

      expect(cron.schedule).toHaveBeenCalledWith(
        mockCheck.cronExpression,
        expect.any(Function),
        expect.objectContaining({ scheduled: false })
      );
      expect(HealthCheck.updateOne).toHaveBeenCalledWith(
        { _id: 'check123' },
        expect.objectContaining({ $set: { nextRunAt: expect.any(Date) } })
      );
    });

    test('throws error for invalid cron expression', async () => {
      cron.validate.mockReturnValue(false);
      const mockCheck = { _id: 'bad', cronExpression: 'invalid' };

      await expect(healthChecksScheduler.scheduleCheck(mockCheck)).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('unscheduleCheck', () => {
    test('stops and removes a scheduled check', async () => {
      const mockTask = { stop: jest.fn() };
      healthChecksScheduler.scheduledChecks.set('check123', mockTask);
      
      await healthChecksScheduler.unscheduleCheck('check123');

      expect(mockTask.stop).toHaveBeenCalled();
      expect(healthChecksScheduler.scheduledChecks.has('check123')).toBe(false);
      expect(HealthCheck.updateOne).toHaveBeenCalledWith(
        { _id: 'check123' },
        { $set: { nextRunAt: null } }
      );
    });
  });

  describe('trigger', () => {
    test('manually triggers a health check', async () => {
      healthChecksService.runHealthCheckOnce.mockResolvedValue({ status: 'healthy' });
      
      const result = await healthChecksScheduler.trigger('check123');

      expect(healthChecksService.runHealthCheckOnce).toHaveBeenCalledWith('check123', { trigger: 'manual' });
      expect(result).toEqual({ status: 'healthy' });
    });
  });
});
