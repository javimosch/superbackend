const controller = require('./adminDataCleanup.controller');
const dataCleanup = require('../services/dataCleanup.service');

jest.mock('../services/dataCleanup.service');

describe('adminDataCleanup.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('getOverview', () => {
    test('returns overview stats successfully', async () => {
      const mockData = {
        global: { db: 'test', collections: 5 },
        collections: [{ name: 'users', count: 100 }]
      };
      dataCleanup.getOverviewStats.mockResolvedValue(mockData);

      await controller.getOverview(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockData);
      expect(dataCleanup.getOverviewStats).toHaveBeenCalled();
    });

    test('handles service errors', async () => {
      const error = new Error('Service error');
      dataCleanup.getOverviewStats.mockRejectedValue(error);
      dataCleanup.toSafeJsonError.mockReturnValue({ status: 500, body: { error: 'Service error' } });

      await controller.getOverview(mockReq, mockRes);

      expect(dataCleanup.toSafeJsonError).toHaveBeenCalledWith(error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service error' });
    });
  });

  describe('dryRun', () => {
    test('returns dry run results successfully', async () => {
      const mockOut = {
        collection: 'users',
        candidateCount: 50,
        estimatedReclaimableBytes: 1024
      };
      mockReq.body = { collection: 'users', olderThanDays: 30 };
      dataCleanup.dryRunCollectionCleanup.mockResolvedValue(mockOut);

      await controller.dryRun(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockOut);
      expect(dataCleanup.dryRunCollectionCleanup).toHaveBeenCalledWith(mockReq.body);
    });

    test('handles service errors', async () => {
      const error = new Error('Validation error');
      mockReq.body = { collection: 'users' };
      dataCleanup.dryRunCollectionCleanup.mockRejectedValue(error);
      dataCleanup.toSafeJsonError.mockReturnValue({ status: 400, body: { error: 'Validation error' } });

      await controller.dryRun(mockReq, mockRes);

      expect(dataCleanup.toSafeJsonError).toHaveBeenCalledWith(error);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Validation error' });
    });
  });

  describe('execute', () => {
    test('executes cleanup successfully', async () => {
      const mockOut = {
        collection: 'users',
        deletedCount: 50,
        durationMs: 100
      };
      mockReq.body = { collection: 'users', olderThanDays: 30, confirm: true };
      dataCleanup.executeCollectionCleanup.mockResolvedValue(mockOut);

      await controller.execute(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockOut);
      expect(dataCleanup.executeCollectionCleanup).toHaveBeenCalledWith(mockReq.body);
    });

    test('handles service errors', async () => {
      const error = new Error('Execution error');
      mockReq.body = { collection: 'users', confirm: true };
      dataCleanup.executeCollectionCleanup.mockRejectedValue(error);
      dataCleanup.toSafeJsonError.mockReturnValue({ status: 500, body: { error: 'Execution error' } });

      await controller.execute(mockReq, mockRes);

      expect(dataCleanup.toSafeJsonError).toHaveBeenCalledWith(error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Execution error' });
    });
  });

  describe('inferFields', () => {
    test('returns 400 when collection query parameter is missing', async () => {
      mockReq.query = {};

      await controller.inferFields(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'collection query parameter is required' });
      expect(dataCleanup.inferCollectionFields).not.toHaveBeenCalled();
    });

    test('returns inferred fields successfully', async () => {
      const mockFields = ['_id', 'name', 'email', 'createdAt'];
      mockReq.query = { collection: 'users' };
      dataCleanup.inferCollectionFields.mockResolvedValue(mockFields);

      await controller.inferFields(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ fields: mockFields });
      expect(dataCleanup.inferCollectionFields).toHaveBeenCalledWith('users');
    });

    test('handles service errors', async () => {
      const error = new Error('Collection not found');
      mockReq.query = { collection: 'nonexistent' };
      dataCleanup.inferCollectionFields.mockRejectedValue(error);
      dataCleanup.toSafeJsonError.mockReturnValue({ status: 404, body: { error: 'Collection not found' } });

      await controller.inferFields(mockReq, mockRes);

      expect(dataCleanup.toSafeJsonError).toHaveBeenCalledWith(error);
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Collection not found' });
    });
  });
});
