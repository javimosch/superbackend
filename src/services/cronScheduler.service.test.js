const cron = require('node-cron');
const CronJob = require('../models/CronJob');
const CronExecution = require('../models/CronExecution');
const cronScheduler = require('./cronScheduler.service');

jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    start: jest.fn(),
    stop: jest.fn()
  }),
  validate: jest.fn().mockReturnValue(true)
}));

jest.mock('../models/CronJob', () => ({
  find: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('../models/CronExecution', () => ({
  create: jest.fn(),
  updateOne: jest.fn()
}));

describe('cronScheduler.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cronScheduler.scheduledJobs.clear();
    cronScheduler.isRunning = false;
  });

  describe('start', () => {
    test('loads enabled jobs and schedules them', async () => {
      const mockJobs = [
        { _id: 'job1', name: 'Job 1', cronExpression: '* * * * *', enabled: true },
        { _id: 'job2', name: 'Job 2', cronExpression: '0 0 * * *', enabled: true }
      ];
      CronJob.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockJobs) });
      
      await cronScheduler.start();

      expect(cronScheduler.isRunning).toBe(true);
      expect(cron.schedule).toHaveBeenCalledTimes(2);
      expect(cronScheduler.scheduledJobs.size).toBe(2);
    });

    test('does nothing if already running', async () => {
      cronScheduler.isRunning = true;
      await cronScheduler.start();
      expect(CronJob.find).not.toHaveBeenCalled();
    });
  });

  describe('scheduleJob', () => {
    test('schedules a job and updates nextRunAt', async () => {
      const mockJob = { _id: 'job123', name: 'Test', cronExpression: '*/5 * * * *' };
      
      await cronScheduler.scheduleJob(mockJob);

      expect(cron.schedule).toHaveBeenCalledWith(
        mockJob.cronExpression,
        expect.any(Function),
        expect.any(Object)
      );
      expect(CronJob.updateOne).toHaveBeenCalledWith(
        { _id: 'job123' },
        expect.objectContaining({ $set: { nextRunAt: expect.any(Date) } })
      );
    });

    test('throws error for invalid cron expression', async () => {
      cron.validate.mockReturnValue(false);
      const mockJob = { _id: 'bad', cronExpression: 'invalid' };

      await expect(cronScheduler.scheduleJob(mockJob)).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('stop', () => {
    test('stops all scheduled tasks', async () => {
      const mockTask = { stop: jest.fn() };
      cronScheduler.scheduledJobs.set('job1', mockTask);
      
      await cronScheduler.stop();

      expect(mockTask.stop).toHaveBeenCalled();
      expect(cronScheduler.scheduledJobs.size).toBe(0);
      expect(cronScheduler.isRunning).toBe(false);
    });
  });
});
