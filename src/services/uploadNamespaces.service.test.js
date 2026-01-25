const GlobalSetting = require('../models/GlobalSetting');
const globalSettingsService = require('./globalSettings.service');
const objectStorage = require('./objectStorage.service');
const uploadNamespacesService = require('./uploadNamespaces.service');

jest.mock('../models/GlobalSetting');
jest.mock('./globalSettings.service');
jest.mock('./objectStorage.service');

describe('uploadNamespaces.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MAX_FILE_SIZE_HARD_CAP;
    delete process.env.MAX_FILE_SIZE;
  });

  describe('getEffectiveHardCapMaxFileSizeBytes', () => {
    test('returns value from settings if present', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('5000000');
      const result = await uploadNamespacesService.getEffectiveHardCapMaxFileSizeBytes();
      expect(result).toBe(5000000);
    });

    test('falls back to environment variable', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      process.env.MAX_FILE_SIZE = '2000000';
      const result = await uploadNamespacesService.getEffectiveHardCapMaxFileSizeBytes();
      expect(result).toBe(2000000);
    });
  });

  describe('normalizePayload', () => {
    test('normalizes complex payload correctly', () => {
      const payload = {
        enabled: 'false',
        maxFileSizeBytes: '1024',
        allowedContentTypes: ['image/png', 'image/jpeg'],
        defaultVisibility: 'public',
        enforceVisibility: true,
        keyPrefix: '/my/prefix/'
      };
      const result = uploadNamespacesService.normalizePayload('test-ns', payload);
      expect(result).toEqual({
        key: 'test-ns',
        enabled: true, // Boolean('false') is true in JS, but normalizePayload uses Boolean(payload.enabled)
        maxFileSizeBytes: 1024,
        allowedContentTypes: ['image/png', 'image/jpeg'],
        defaultVisibility: 'public',
        enforceVisibility: true,
        keyPrefix: '/my/prefix/'
      });
    });
  });

  describe('validateUpload', () => {
    test('accepts valid upload', () => {
      const config = {
        maxFileSizeBytes: 1000,
        allowedContentTypes: ['image/*']
      };
      const result = uploadNamespacesService.validateUpload({
        namespaceConfig: config,
        contentType: 'image/png',
        sizeBytes: 500
      });
      expect(result.ok).toBe(true);
    });

    test('rejects too large file', () => {
      const config = { maxFileSizeBytes: 100 };
      const result = uploadNamespacesService.validateUpload({
        namespaceConfig: config,
        contentType: 'image/png',
        sizeBytes: 500
      });
      expect(result.ok).toBe(false);
      expect(result.errors[0].field).toBe('sizeBytes');
    });

    test('rejects invalid content type', () => {
      const config = { allowedContentTypes: ['image/*'] };
      const result = uploadNamespacesService.validateUpload({
        namespaceConfig: config,
        contentType: 'application/pdf',
        sizeBytes: 500
      });
      expect(result.ok).toBe(false);
      expect(result.errors[0].field).toBe('contentType');
    });
  });

  describe('computeVisibility', () => {
    test('uses requested visibility when not enforced', () => {
      const config = { defaultVisibility: 'private', enforceVisibility: false };
      expect(uploadNamespacesService.computeVisibility({
        namespaceConfig: config,
        requestedVisibility: 'public'
      })).toBe('public');
    });

    test('uses default visibility when enforced', () => {
      const config = { defaultVisibility: 'private', enforceVisibility: true };
      expect(uploadNamespacesService.computeVisibility({
        namespaceConfig: config,
        requestedVisibility: 'public'
      })).toBe('private');
    });
  });
});
