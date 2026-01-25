const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const globalSettingsService = require('./globalSettings.service');
const objectStorage = require('./objectStorage.service');

jest.mock('fs');
jest.mock('./globalSettings.service');

describe('objectStorage.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    objectStorage.clearStorageConfigCache();
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_BUCKET;
  });

  describe('validateS3Config', () => {
    test('validates and returns config object', () => {
      const valid = {
        endpoint: 'http://localhost:9000',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        bucket: 'test'
      };
      const result = objectStorage.validateS3Config(valid);
      expect(result.bucket).toBe('test');
      expect(result.region).toBe('us-east-1');
    });

    test('returns null for incomplete config', () => {
      expect(objectStorage.validateS3Config({ bucket: 'test' })).toBeNull();
    });
  });

  describe('getActiveBackend', () => {
    test('returns fs by default when no S3 config', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      const backend = await objectStorage.getActiveBackend();
      expect(backend).toBe('fs');
    });

    test('returns s3 when configured in settings', async () => {
      globalSettingsService.getSettingValue.mockImplementation((key) => {
        if (key === 'STORAGE_BACKEND') return 's3';
        return null;
      });
      const backend = await objectStorage.getActiveBackend();
      expect(backend).toBe('s3');
    });
  });

  describe('generateKey', () => {
    test('generates a key with extension and prefix', () => {
      const key = objectStorage.generateKey('test.png', 'myprefix');
      expect(key).toMatch(/^myprefix\/\d{4}\/\d{2}\/[a-f0-9]+\.png$/);
    });
  });

  describe('file validation', () => {
    test('validateContentType checks against allowed types', () => {
      expect(objectStorage.validateContentType('image/jpeg')).toBe(true);
      expect(objectStorage.validateContentType('application/invalid')).toBe(false);
    });

    test('validateFileSize checks size limit', () => {
      // Default limit is 10MB
      expect(objectStorage.validateFileSize(5 * 1024 * 1024)).toBe(true);
      expect(objectStorage.validateFileSize(20 * 1024 * 1024)).toBe(false);
    });
  });

  describe('filesystem operations', () => {
    test('putObject calls fs for fs backend', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('fs');
      fs.existsSync.mockReturnValue(true);
      
      const result = await objectStorage.putObject({
        key: 'test/key.txt',
        body: Buffer.from('hello'),
        backend: 'fs'
      });

      expect(result.provider).toBe('fs');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('getObject calls fs for fs backend', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(Buffer.from('hello'));
      
      const result = await objectStorage.getObject({
        key: 'test/key.txt',
        backend: 'fs'
      });

      expect(result.body.toString()).toBe('hello');
    });

    test('deleteObject calls fs for fs backend', async () => {
      fs.existsSync.mockReturnValue(true);
      
      const result = await objectStorage.deleteObject({
        key: 'test/key.txt',
        backend: 'fs'
      });

      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });
});
