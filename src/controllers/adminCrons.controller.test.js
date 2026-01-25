const controller = require('./adminCrons.controller');
const CronJob = require('../models/CronJob');
const CronExecution = require('../models/CronExecution');
const cronScheduler = require('../services/cronScheduler.service');
const mongoose = require('mongoose');

jest.mock('../models/CronJob');
jest.mock('../models/CronExecution');
jest.mock('../services/cronScheduler.service');
jest.mock('../models/GlobalSetting', () => ({
  findOne: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(null)
  }))
}), { virtual: true });

describe('adminCrons.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
      user: { username: 'admin' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('listCronJobs', () => {
    test('returns all cron jobs with populated scripts', async () => {
      const mockJobs = [{ _id: 'j1', name: 'Job 1' }];
      CronJob.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockJobs)
      });

      await controller.listCronJobs(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockJobs });
    });
  });

  describe('createCronJob', () => {
    test('creates and schedules a new HTTP cron job', async () => {
      mockReq.body = {
        name: 'Ping',
        cronExpression: '*/5 * * * *',
        taskType: 'http',
        httpUrl: 'https://test.com'
      };

      const mockDoc = {
        ...mockReq.body,
        _id: 'j1',
        enabled: true,
        toObject: () => ({ _id: 'j1', name: 'Ping' })
      };
      CronJob.create.mockResolvedValue(mockDoc);

      await controller.createCronJob(mockReq, mockRes);

      expect(CronJob.create).toHaveBeenCalled();
      expect(cronScheduler.scheduleJob).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 500 for invalid cron expression', async () => {
      mockReq.body = { cronExpression: 'invalid' };
      await controller.createCronJob(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('triggerCronJob', () => {
    test('executes job immediately via scheduler', async () => {
      mockReq.params.id = 'j1';
      const mockJob = { _id: 'j1' };
      CronJob.findById.mockResolvedValue(mockJob);
      cronScheduler.executeJob.mockResolvedValue({ _id: 'e1' });

      await controller.triggerCronJob(mockReq, mockRes);

      expect(cronScheduler.executeJob).toHaveBeenCalledWith(mockJob);
      expect(mockRes.json).toHaveBeenCalledWith({ executionId: 'e1' });
    });
  });

  describe('getExecutionHistory', () => {
    test('returns paginated execution records', async () => {
      mockReq.params.id = 'j1';
      const mockExecs = [{ _id: 'e1', status: 'success' }];
      CronExecution.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockExecs)
      });
      CronExecution.countDocuments.mockResolvedValue(1);

      await controller.getExecutionHistory(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        items: mockExecs,
        pagination: expect.objectContaining({ total: 1 })
      }));
    });
  });
});
