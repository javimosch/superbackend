const controller = require('./adminAssetsStorage.controller');
const GlobalSetting = require('../models/GlobalSetting');
const objectStorage = require('../services/objectStorage.service');
const globalSettingsService = require('../services/globalSettings.service');

jest.mock('../models/GlobalSetting');
jest.mock('../models/Asset');
jest.mock('../services/objectStorage.service');
jest.mock('../services/globalSettings.service');
jest.mock('../utils/encryption', () => ({
  encryptString: jest.fn((v) => ({ ciphertext: v, iv: 'iv', tag: 'tag', alg: 'aes-256-gcm', keyId: 'v1' })),
  decryptString: jest.fn((v) => v.ciphertext)
}));

describe('adminAssetsStorage.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { body: {}, params: {}, query: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('getStorageStatus', () => {
    test('returns active backend and masked S3 config', async () => {
      objectStorage.getActiveBackend.mockResolvedValue('s3');
      objectStorage.getS3Config.mockResolvedValue({
        endpoint: 'http://localhost:9000',
        bucket: 'test-bucket',
        accessKeyId: 'key',
        secretAccessKey: 'secret'
      });

      await controller.getStorageStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        activeBackend: 's3',
        s3: expect.objectContaining({
          configured: true,
          config: expect.objectContaining({ accessKeyId: '********' })
        })
      }));
    });
  });

  describe('saveS3Config', () => {
    test('validates and saves encrypted S3 config', async () => {
      mockReq.body = {
        endpoint: 'http://localhost:9000',
        bucket: 'test-bucket',
        accessKeyId: 'key',
        secretAccessKey: 'secret'
      };
      
      objectStorage.getS3Config.mockResolvedValue(null);
      objectStorage.validateS3Config.mockReturnValue(mockReq.body);
      GlobalSetting.findOne.mockResolvedValue(null);
      GlobalSetting.create.mockResolvedValue({ toObject: () => ({}) });

      await controller.saveS3Config(mockReq, mockRes);

      expect(objectStorage.validateS3Config).toHaveBeenCalled();
      expect(GlobalSetting.create).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    test('returns 400 for invalid config', async () => {
      mockReq.body = { bucket: 'incomplete' };
      objectStorage.validateS3Config.mockReturnValue(null);

      await controller.saveS3Config(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('switchBackend', () => {
    test('switches active backend to S3 after checking connection', async () => {
      mockReq.body = { backend: 's3' };
      objectStorage.checkS3Connection.mockResolvedValue({ ok: true });
      GlobalSetting.findOne.mockResolvedValue(null);
      GlobalSetting.create.mockResolvedValue({ toObject: () => ({}) });

      await controller.switchBackend(mockReq, mockRes);

      expect(objectStorage.checkS3Connection).toHaveBeenCalled();
      expect(GlobalSetting.create).toHaveBeenCalledWith(expect.objectContaining({
        key: 'STORAGE_BACKEND',
        value: 's3'
      }));
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ activeBackend: 's3' }));
    });
  });
});
