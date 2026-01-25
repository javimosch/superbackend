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

  describe('file operations', () => {
    const mockFileId = new mongoose.Types.ObjectId();
    const mockAssetId = new mongoose.Types.ObjectId();
    const mockEntry = { _id: mockFileId, assetId: mockAssetId, parentPath: '/', path: '/test.txt', name: 'test.txt', visibility: 'private' };
    const mockAsset = { _id: mockAssetId, key: 'assets/k1', visibilityEnforced: false };

    beforeEach(() => {
      FileEntry.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockEntry) });
      Asset.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockAsset) });
    });

    test('downloadFile retrieves file from storage', async () => {
      objectStorage.getObject.mockResolvedValue({ body: Buffer.from('data'), contentType: 'text/plain' });

      const result = await fileManagerService.downloadFile({
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId,
        fileId: mockFileId
      });

      expect(result.body.toString()).toBe('data');
      expect(objectStorage.getObject).toHaveBeenCalledWith({ key: 'assets/k1' });
    });

    test('deleteFile removes from storage and marks as deleted in DB', async () => {
      await fileManagerService.deleteFile({
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId,
        fileId: mockFileId
      });

      expect(objectStorage.deleteObject).toHaveBeenCalledWith({ key: 'assets/k1' });
      expect(Asset.findByIdAndUpdate).toHaveBeenCalled();
      expect(FileEntry.findByIdAndUpdate).toHaveBeenCalled();
    });

    test('setShare updates visibility', async () => {
      const result = await fileManagerService.setShare({
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId,
        fileId: mockFileId,
        enabled: true
      });

      expect(result.success).toBe(true);
      expect(result.visibility).toBe('public');
      expect(Asset.findByIdAndUpdate).toHaveBeenCalledWith(mockAssetId, expect.objectContaining({ $set: { visibility: 'public' } }));
    });

    test('updateFile renames or moves file', async () => {
      const mockDoc = { 
        ...mockEntry, 
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };
      
      // Reset and setup specific mocks for this test
      FileEntry.findOne.mockReset();
      // First call: find the entry
      FileEntry.findOne.mockResolvedValueOnce(mockDoc);
      // Second call: conflict check
      FileEntry.findOne.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });
      
      uploadNamespacesService.resolveNamespace.mockResolvedValue({ key: 'default' });

      const result = await fileManagerService.updateFile({
        orgId: mockOrgId,
        driveType: 'user',
        driveId: mockUserId,
        fileId: mockFileId,
        name: 'new-name.txt'
      });

      expect(result.file.name).toBe('new-name.txt');
      expect(mockDoc.save).toHaveBeenCalled();
    });
  });
});
