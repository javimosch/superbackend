const mongoose = require('mongoose');
const Asset = require('../models/Asset');
const FileEntry = require('../models/FileEntry');
const RbacGroup = require('../models/RbacGroup');
const RbacGroupMember = require('../models/RbacGroupMember');
const objectStorage = require('./objectStorage.service');
const uploadNamespacesService = require('./uploadNamespaces.service');
const fileManagerStoragePolicyService = require('./fileManagerStoragePolicy.service');
const fileManagerService = require('./fileManager.service');

jest.mock('../models/Asset');
jest.mock('../models/FileEntry');
jest.mock('../models/RbacGroup');
jest.mock('../models/RbacGroupMember');
jest.mock('./objectStorage.service');
jest.mock('./uploadNamespaces.service');
jest.mock('./fileManagerStoragePolicy.service');

describe('fileManager.service', () => {
  const mockOrgId = new mongoose.Types.ObjectId();
  const mockUserId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizePath', () => {
    test('normalizes various path formats', () => {
      expect(fileManagerService.normalizePath('/')).toBe('/');
      expect(fileManagerService.normalizePath('')).toBe('/');
      expect(fileManagerService.normalizePath('foo')).toBe('/foo');
      expect(fileManagerService.normalizePath('/foo/')).toBe('/foo');
      expect(fileManagerService.normalizePath('///foo///bar//')).toBe('/foo/bar');
    });
  });

  describe('listDrives', () => {
    test('returns user, group, and org drives', async () => {
      const mockGroupId = new mongoose.Types.ObjectId();
      RbacGroupMember.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ groupId: mockGroupId }])
      });
      RbacGroup.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: mockGroupId, name: 'Team Alpha' }])
      });

      const result = await fileManagerService.listDrives({ 
        userId: mockUserId, 
        orgId: mockOrgId 
      });

      expect(result.drives).toHaveLength(3);
      expect(result.drives[0].driveType).toBe('user');
      expect(result.drives[1].label).toBe('Team Alpha');
      expect(result.drives[2].driveType).toBe('org');
    });
  });

  describe('listFolder', () => {
    test('lists files and virtual folders', async () => {
      const mockAssetId = new mongoose.Types.ObjectId();
      const mockFileId = new mongoose.Types.ObjectId();
      
      const mockFiles = [{
        _id: mockFileId,
        name: 'file.txt',
        parentPath: '/test',
        visibility: 'private',
        assetId: mockAssetId
      }];

      FileEntry.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockFiles)
      }).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ parentPath: '/test/sub' }])
      });

      Asset.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: mockAssetId, key: 'k1', sizeBytes: 100 }])
      });

      const result = await fileManagerService.listFolder({
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId,
        parentPath: '/test'
      });

      expect(result.files).toHaveLength(1);
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('sub');
    });
  });

  describe('uploadFile', () => {
    test('uploads a new file and creates entries', async () => {
      FileEntry.findOne.mockResolvedValue(null);
      uploadNamespacesService.resolveNamespace.mockResolvedValue({ key: 'default' });
      fileManagerStoragePolicyService.resolveEffectiveLimits.mockResolvedValue({ maxUploadBytes: 1000 });
      uploadNamespacesService.validateUpload.mockReturnValue({ ok: true });
      uploadNamespacesService.computeVisibility.mockReturnValue('private');
      uploadNamespacesService.generateObjectKey.mockReturnValue('k1');
      objectStorage.putObject.mockResolvedValue({ provider: 'fs', bucket: 'fs' });
      
      Asset.create.mockResolvedValue({ _id: 'a1', visibility: 'private' });
      FileEntry.create.mockResolvedValue({ _id: 'f1' });

      const result = await fileManagerService.uploadFile({
        userId: mockUserId,
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId,
        parentPath: '/',
        name: 'test.txt',
        buffer: Buffer.from('hello'),
        contentType: 'text/plain'
      });

      expect(objectStorage.putObject).toHaveBeenCalled();
      expect(Asset.create).toHaveBeenCalled();
      expect(FileEntry.create).toHaveBeenCalled();
      expect(result.file).toBeDefined();
    });

    test('throws error if file exists and overwrite is false', async () => {
      FileEntry.findOne.mockResolvedValue({ _id: 'existing' });
      uploadNamespacesService.resolveNamespace.mockResolvedValue({ key: 'default' });
      fileManagerStoragePolicyService.resolveEffectiveLimits.mockResolvedValue({ maxUploadBytes: 1000 });
      uploadNamespacesService.validateUpload.mockReturnValue({ ok: true });

      await expect(fileManagerService.uploadFile({
        userId: mockUserId,
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId,
        parentPath: '/',
        name: 'test.txt',
        buffer: Buffer.from('hello'),
        contentType: 'text/plain'
      })).rejects.toThrow('File already exists');
    });
  });
});
