const controller = require('./adminCache.controller');
const cacheLayer = require('../services/cacheLayer.service');
const GlobalSetting = require('../models/GlobalSetting');
const globalSettingsService = require('../services/globalSettings.service');

jest.mock('../models/GlobalSetting');
jest.mock('../services/cacheLayer.service');
jest.mock('../services/globalSettings.service');
jest.mock('../utils/encryption', () => ({
  encryptString: jest.fn((v) => ({ ciphertext: v, iv: 'iv', tag: 'tag', alg: 'aes-256-gcm', keyId: 'v1' })),
  decryptString: jest.fn((v) => v.ciphertext)
}));

describe('adminCache.controller', () => {
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

  describe('getConfig', () => {
    test('returns cache layer config', async () => {
      const mockConfig = {
        backend: 'memory',
        evictionPolicy: 'lru',
        redisPrefix: 'test:',
        redisUrl: null,
        offloadThresholdBytes: 1000,
        maxEntryBytes: 100,
        defaultTtlSeconds: 60,
        atRestFormat: 'string'
      };
      cacheLayer.getConfig.mockResolvedValue(mockConfig);

      await controller.getConfig(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        config: expect.objectContaining({
          backend: 'memory',
          evictionPolicy: 'lru'
        })
      });
    });
  });

  describe('updateConfig', () => {
    test('updates multiple cache settings', async () => {
      mockReq.body = {
        backend: 'redis',
        evictionPolicy: 'fifo',
        redisUrl: 'redis://localhost:6379'
      };
      
      cacheLayer.getConfig.mockResolvedValue({ backend: 'memory' });
      GlobalSetting.findOne.mockResolvedValue(null);
      GlobalSetting.create.mockResolvedValue({});

      await controller.updateConfig(mockReq, mockRes);

      expect(GlobalSetting.create).toHaveBeenCalled();
      expect(globalSettingsService.clearSettingsCache).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe('listKeys', () => {
    test('returns keys from cache layer', async () => {
      mockReq.query = { namespace: 'ns1', prefix: 'p1' };
      const mockKeys = { memory: [{ key: 'k1' }], mongo: [] };
      cacheLayer.listKeys.mockResolvedValue(mockKeys);

      await controller.listKeys(mockReq, mockRes);

      expect(cacheLayer.listKeys).toHaveBeenCalledWith({ namespace: 'ns1', prefix: 'p1' });
      expect(mockRes.json).toHaveBeenCalledWith({ items: mockKeys });
    });
  });

  describe('clearCache', () => {
    test('clears cache and returns stats', async () => {
      mockReq.body = { backend: 'all' };
      const mockResult = { ok: true, cleared: { memory: 5, mongo: 2, redis: 0 } };
      cacheLayer.clear.mockResolvedValue(mockResult);

      await controller.clearCache(mockReq, mockRes);

      expect(cacheLayer.clear).toHaveBeenCalledWith(expect.objectContaining({ backend: 'all' }));
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });
  });
});
