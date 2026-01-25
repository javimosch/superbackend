const controller = require('./adminRateLimits.controller');
const rateLimiter = require('../services/rateLimiter.service');

jest.mock('../services/rateLimiter.service');

describe('adminRateLimits.controller', () => {
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

  describe('list', () => {
    test('returns all rate limits', async () => {
      const mockItems = [{ id: 'limit1', points: 10 }];
      rateLimiter.list.mockResolvedValue(mockItems);

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
    });
  });

  describe('getConfig', () => {
    test('returns rate limits config data', async () => {
      const mockDoc = {
        _id: 'config1',
        slug: 'rate-limits',
        title: 'Rate Limits',
        jsonRaw: '{}',
        updatedAt: new Date()
      };
      rateLimiter.getRateLimitsConfigData.mockResolvedValue({ doc: mockDoc });

      await controller.getConfig(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        config: expect.objectContaining({ slug: 'rate-limits' })
      }));
    });
  });

  describe('updateConfig', () => {
    test('updates raw config successfully', async () => {
      mockReq.body = { jsonRaw: '{"limits": {}}' };
      const mockDoc = { _id: 'config1', slug: 'rate-limits', jsonRaw: '{"limits": {}}' };
      rateLimiter.updateRawConfig.mockResolvedValue(mockDoc);

      await controller.updateConfig(mockReq, mockRes);

      expect(rateLimiter.updateRawConfig).toHaveBeenCalledWith({ jsonRaw: '{"limits": {}}' });
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ config: expect.any(Object) }));
    });

    test('returns 400 if jsonRaw missing', async () => {
      mockReq.body = {};
      await controller.updateConfig(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateLimiter', () => {
    test('sets limiter override', async () => {
      mockReq.params.id = 'limit1';
      mockReq.body = { override: { points: 20 } };
      rateLimiter.setLimiterOverride.mockResolvedValue({ points: 20 });

      await controller.updateLimiter(mockReq, mockRes);

      expect(rateLimiter.setLimiterOverride).toHaveBeenCalledWith('limit1', { points: 20 });
      expect(mockRes.json).toHaveBeenCalledWith({ config: { points: 20 } });
    });
  });
});
