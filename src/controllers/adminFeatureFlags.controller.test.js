const controller = require('./adminFeatureFlags.controller');
const GlobalSetting = require('../models/GlobalSetting');
const { FEATURE_FLAG_PREFIX } = require('../services/featureFlags.service');

jest.mock('../models/GlobalSetting');

describe('adminFeatureFlags.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('listFlags', () => {
    test('returns all feature flags mapped from settings', async () => {
      const mockSettings = [
        {
          key: `${FEATURE_FLAG_PREFIX}test1`,
          type: 'json',
          value: JSON.stringify({ enabled: true, rolloutPercentage: 50 }),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ];
      GlobalSetting.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSettings),
      });

      await controller.listFlags(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ key: 'test1', enabled: true, rolloutPercentage: 50 })
      ]));
    });
  });

  describe('getFlag', () => {
    test('returns a single flag by key', async () => {
      mockReq.params.key = 'test1';
      const mockSetting = {
        key: `${FEATURE_FLAG_PREFIX}test1`,
        type: 'json',
        value: JSON.stringify({ enabled: true }),
      };
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockSetting) });

      await controller.getFlag(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ key: 'test1', enabled: true }));
    });

    test('returns 404 if flag not found', async () => {
      mockReq.params.key = 'missing';
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await controller.getFlag(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createFlag', () => {
    test('creates a new flag successfully', async () => {
      mockReq.body = { key: 'new-flag', enabled: true, rolloutPercentage: 10 };
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      
      const mockCreated = {
        key: `${FEATURE_FLAG_PREFIX}new-flag`,
        value: JSON.stringify({ enabled: true, rolloutPercentage: 10 }),
        toObject: () => ({ key: `${FEATURE_FLAG_PREFIX}new-flag`, value: JSON.stringify({ enabled: true, rolloutPercentage: 10 }) })
      };
      GlobalSetting.create.mockResolvedValue(mockCreated);

      await controller.createFlag(mockReq, mockRes);

      expect(GlobalSetting.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 409 if flag already exists', async () => {
      mockReq.body = { key: 'exists' };
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: '1' }) });

      await controller.createFlag(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
    });
  });

  describe('deleteFlag', () => {
    test('deletes a flag by key', async () => {
      mockReq.params.key = 'test1';
      GlobalSetting.findOneAndDelete.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: '1' }) });

      await controller.deleteFlag(mockReq, mockRes);

      expect(GlobalSetting.findOneAndDelete).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
