const mongoose = require('mongoose');
const globalSettingsService = require('./globalSettings.service');
const fileManagerStoragePolicyService = require('./fileManagerStoragePolicy.service');
const FileEntry = require('../models/FileEntry');
const RbacGroupMember = require('../models/RbacGroupMember');
const RbacGroup = require('../models/RbacGroup');

jest.mock('../services/globalSettings.service');
jest.mock('../models/FileEntry');
jest.mock('../models/RbacGroupMember');
jest.mock('../models/RbacGroup');

describe('fileManagerStoragePolicy.service', () => {
  const mockOrgId = new mongoose.Types.ObjectId();
  const mockUserId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FILE_MANAGER_DEFAULT_MAX_UPLOAD_BYTES;
    delete process.env.FILE_MANAGER_DEFAULT_MAX_STORAGE_BYTES;
  });

  describe('loadPolicy', () => {
    test('returns default structure when no policy found', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      const policy = await fileManagerStoragePolicyService.loadPolicy();
      expect(policy).toEqual({ version: 1, global: {}, orgs: {} });
    });

    test('parses and returns JSON policy from settings', async () => {
      const mockPolicy = { version: 2, global: { maxUploadBytes: 100 }, orgs: {} };
      globalSettingsService.getSettingValue.mockResolvedValue(JSON.stringify(mockPolicy));
      const policy = await fileManagerStoragePolicyService.loadPolicy();
      expect(policy.version).toBe(2);
      expect(policy.global.maxUploadBytes).toBe(100);
    });
  });

  describe('resolveEffectiveLimits', () => {
    test('returns default limits when no overrides exist', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      const result = await fileManagerStoragePolicyService.resolveEffectiveLimits({
        userId: mockUserId,
        orgId: mockOrgId,
        driveType: 'org',
        driveId: mockOrgId
      });

      expect(result.maxUploadBytes).toBe(1073741824); // 1GB default
      expect(result.maxStorageBytes).toBe(104857600); // 100MB default
      expect(result.source.maxUpload).toBe('default');
    });

    test('resolves org-specific limits', async () => {
      const mockPolicy = {
        orgs: {
          [String(mockOrgId)]: {
            maxUploadBytes: 500,
            maxStorageBytes: 5000
          }
        }
      };
      globalSettingsService.getSettingValue.mockImplementation((key) => {
        if (key === 'FILE_MANAGER_STORAGE_POLICY_JSON') return JSON.stringify(mockPolicy);
        return null;
      });

      const result = await fileManagerStoragePolicyService.resolveEffectiveLimits({
        userId: mockUserId,
        orgId: mockOrgId,
        driveType: 'org',
        driveId: mockOrgId
      });

      expect(result.maxUploadBytes).toBe(500);
      expect(result.maxStorageBytes).toBe(5000);
      expect(result.source.maxUpload).toBe('org');
    });
  });

  describe('computeDriveUsedBytes', () => {
    test('returns 0 when no files found', async () => {
      FileEntry.aggregate.mockResolvedValue([]);
      const used = await fileManagerStoragePolicyService.computeDriveUsedBytes({
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId
      });
      expect(used).toBe(0);
    });

    test('returns sum of asset sizes from aggregate', async () => {
      FileEntry.aggregate.mockResolvedValue([{ usedBytes: 1234 }]);
      const used = await fileManagerStoragePolicyService.computeDriveUsedBytes({
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId
      });
      expect(used).toBe(1234);
    });
  });
});
