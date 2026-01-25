const controller = require('./adminAssets.controller');
const Asset = require('../models/Asset');
const objectStorage = require('../services/objectStorage.service');
const uploadNamespacesService = require('../services/uploadNamespaces.service');
const mongoose = require('mongoose');

jest.mock('../models/Asset');
jest.mock('../services/objectStorage.service');
jest.mock('../services/uploadNamespaces.service');

describe('adminAssets.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      query: {},
      params: {},
      body: {},
      file: null,
      files: null
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('list', () => {
    test('returns assets with pagination and storage check', async () => {
      const mockAssets = [
        { _id: 'a1', key: 'k1', provider: 'fs', visibility: 'public', toObject: function() { return this; } }
      ];
      Asset.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAssets)
      });
      Asset.countDocuments.mockResolvedValue(1);
      objectStorage.objectExists.mockResolvedValue(true);

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        assets: expect.arrayContaining([expect.objectContaining({ storageExists: true })]),
        pagination: expect.objectContaining({ total: 1 })
      }));
    });
  });

  describe('bulkSetTags', () => {
    test('updates tags for multiple assets', async () => {
      mockReq.body = { assetIds: ['a1', 'a2'], tags: 'tag1,tag2' };
      const mockAsset = { _id: 'a1', status: 'uploaded', save: jest.fn().mockResolvedValue(true) };
      Asset.find.mockResolvedValue([mockAsset]);

      await controller.bulkSetTags(mockReq, mockRes);

      expect(mockAsset.tags).toEqual(['tag1', 'tag2']);
      expect(mockAsset.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ updated: 1 }));
    });

    test('returns 400 for empty assetIds', async () => {
      mockReq.body = { assetIds: [] };
      await controller.bulkSetTags(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('delete', () => {
    test('deletes asset from storage and marks as deleted in DB', async () => {
      mockReq.params.id = 'a1';
      const mockAsset = { _id: 'a1', key: 'k1', status: 'uploaded', save: jest.fn().mockResolvedValue(true) };
      Asset.findById.mockResolvedValue(mockAsset);

      await controller.delete(mockReq, mockRes);

      expect(objectStorage.deleteObject).toHaveBeenCalledWith({ key: 'k1' });
      expect(mockAsset.status).toBe('deleted');
      expect(mockAsset.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
