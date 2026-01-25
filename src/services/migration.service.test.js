const GlobalSetting = require('../models/GlobalSetting');
const { encryptString, decryptString } = require('../utils/encryption');
const migrationService = require('./migration.service');

jest.mock('../models/GlobalSetting');
jest.mock('../utils/encryption');

describe('migration.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listEnvironments', () => {
    test('returns list of environments from settings', async () => {
      const mockSettings = [
        {
          key: 'ENV_CONF_PROD',
          type: 'encrypted',
          value: JSON.stringify({ ciphertext: 'abc' }),
          updatedAt: new Date(),
          createdAt: new Date()
        }
      ];
      GlobalSetting.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSettings)
      });

      decryptString.mockReturnValue(JSON.stringify({
        name: 'Production',
        connectionString: 'mongodb://prod:27017/db'
      }));

      const result = await migrationService.listEnvironments();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Production');
      expect(result[0].connectionStringMasked).toBe('mongod********7/db');
    });
  });

  describe('getEnvironmentConfig', () => {
    test('returns full config for valid key', async () => {
      const mockSetting = {
        key: 'ENV_CONF_TEST',
        type: 'encrypted',
        value: JSON.stringify({ ciphertext: 'abc' })
      };
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockSetting) });
      decryptString.mockReturnValue(JSON.stringify({
        name: 'Test',
        connectionString: 'mongodb://test'
      }));

      const result = await migrationService.getEnvironmentConfig('TEST');

      expect(result.name).toBe('Test');
      expect(result.connectionString).toBe('mongodb://test');
    });

    test('returns null if environment not found', async () => {
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      const result = await migrationService.getEnvironmentConfig('MISSING');
      expect(result).toBeNull();
    });
  });

  describe('deleteEnvironment', () => {
    test('deletes environment and returns ok', async () => {
      GlobalSetting.findOneAndDelete.mockReturnValue({ lean: jest.fn().mockResolvedValue({ key: 'ENV_CONF_X' }) });
      const result = await migrationService.deleteEnvironment('X');
      expect(result.ok).toBe(true);
    });

    test('throws 404 if environment not found', async () => {
      GlobalSetting.findOneAndDelete.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      await expect(migrationService.deleteEnvironment('X')).rejects.toThrow('Environment not found');
    });
  });
});
