jest.mock('../models/GlobalSetting', () => ({
  findOne: jest.fn(() => ({
    lean: jest.fn()
  }))
}));

jest.mock('../utils/encryption', () => ({
  decryptString: jest.fn()
}));

const GlobalSetting = require('../models/GlobalSetting');
const { decryptString } = require('../utils/encryption');
const globalSettingsService = require('./globalSettings.service');

describe('globalSettings.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalSettingsService.clearSettingsCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getSettingValue', () => {
    test('returns cached value when within TTL', async () => {
      const mockSetting = { key: 'test-key', value: 'cached-value', type: 'plain' };
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSetting)
      });

      const first = await globalSettingsService.getSettingValue('test-key', 'default');
      const second = await globalSettingsService.getSettingValue('test-key', 'default');

      expect(first).toBe('cached-value');
      expect(second).toBe('cached-value');
      expect(GlobalSetting.findOne).toHaveBeenCalledTimes(1);
    });

    test('fetches from database when cache expired', async () => {
      const mockSetting = { key: 'test-key', value: 'new-value', type: 'plain' };
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSetting)
      });

      await globalSettingsService.getSettingValue('test-key', 'default');
      
      jest.advanceTimersByTime(61000);
      
      await globalSettingsService.getSettingValue('test-key', 'default');

      expect(GlobalSetting.findOne).toHaveBeenCalledTimes(2);
    });

    test('returns default value when setting not found', async () => {
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });

      const result = await globalSettingsService.getSettingValue('missing-key', 'default-value');

      expect(result).toBe('default-value');
    });

    test('decrypts encrypted settings', async () => {
      const encryptedPayload = JSON.stringify('encrypted-data');
      const mockSetting = { key: 'secret', value: encryptedPayload, type: 'encrypted' };
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSetting)
      });
      decryptString.mockReturnValue('decrypted-value');

      const result = await globalSettingsService.getSettingValue('secret');

      expect(decryptString).toHaveBeenCalledWith('encrypted-data');
      expect(result).toBe('decrypted-value');
    });

    test('handles decryption errors gracefully', async () => {
      const mockSetting = { key: 'corrupted', value: 'invalid-json', type: 'encrypted' };
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSetting)
      });
      decryptString.mockImplementation(() => { throw new Error('Decrypt failed'); });

      const result = await globalSettingsService.getSettingValue('corrupted', 'fallback');

      expect(result).toBe('fallback');
    });

    test('returns plain value for non-encrypted settings', async () => {
      const mockSetting = { key: 'plain', value: 'plain-text', type: 'plain' };
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSetting)
      });

      const result = await globalSettingsService.getSettingValue('plain');

      expect(result).toBe('plain-text');
      expect(decryptString).not.toHaveBeenCalled();
    });

    test('handles database errors with default value', async () => {
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('DB connection failed'))
      });

      const result = await globalSettingsService.getSettingValue('error-key', 'error-default');

      expect(result).toBe('error-default');
    });

    test('uses null as default when not provided', async () => {
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });

      const result = await globalSettingsService.getSettingValue('no-default');

      expect(result).toBeNull();
    });

    test('caches error results to prevent repeated DB calls', async () => {
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('Persistent error'))
      });

      const first = await globalSettingsService.getSettingValue('error-key', 'default');
      const second = await globalSettingsService.getSettingValue('error-key', 'default');

      expect(first).toBe('default');
      expect(second).toBe('default');
      expect(GlobalSetting.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearSettingsCache', () => {
    test('clears all cached settings', async () => {
      const mockSetting = { key: 'test', value: 'value', type: 'plain' };
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSetting)
      });

      await globalSettingsService.getSettingValue('test');
      globalSettingsService.clearSettingsCache();
      await globalSettingsService.getSettingValue('test');

      expect(GlobalSetting.findOne).toHaveBeenCalledTimes(2);
    });
  });
});
