const controller = require('./assets.controller');
const Asset = require('../models/Asset');
const objectStorage = require('../services/objectStorage.service');
const uploadNamespacesService = require('../services/uploadNamespaces.service');
const mongoose = require('mongoose');

jest.mock('../models/Asset');
jest.mock('../services/objectStorage.service');
jest.mock('../services/uploadNamespaces.service');

describe('assets.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { _id: new mongoose.Types.ObjectId() },
      query: {},
      params: {},
      body: {},
      file: null,
      files: null
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn(),
      send: jest.fn()
    };
  });

  describe('upload', () => {
    test('uploads an asset successfully', async () => {
      mockReq.file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/png',
        originalname: 'test.png'
      };
      
      uploadNamespacesService.resolveNamespace.mockResolvedValue({ key: 'default' });
      uploadNamespacesService.getEffectiveHardCapMaxFileSizeBytes.mockResolvedValue(1000000);
      uploadNamespacesService.validateUpload.mockReturnValue({ ok: true });
      uploadNamespacesService.generateObjectKey.mockReturnValue('assets/k1');
      uploadNamespacesService.computeVisibility.mockReturnValue('private');
      
      objectStorage.putObject.mockResolvedValue({ provider: 'fs', bucket: 'fs' });
      
      const mockAsset = { 
        _id: 'a1', 
        key: 'assets/k1',
        toObject: function() { return this; }
      };
      Asset.create.mockResolvedValue(mockAsset);

      await controller.upload(mockReq, mockRes);

      expect(Asset.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 400 if no file provided', async () => {
      await controller.upload(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('list', () => {
    test('returns user assets', async () => {
      const mockAssets = [{ _id: 'a1', key: 'k1', visibility: 'private' }];
      Asset.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAssets)
      });
      Asset.countDocuments.mockResolvedValue(1);

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        assets: expect.any(Array),
        pagination: expect.objectContaining({ total: 1 })
      }));
    });
  });

  describe('download', () => {
    test('sends asset buffer', async () => {
      const assetId = new mongoose.Types.ObjectId();
      mockReq.params.id = String(assetId);
      
      const mockAsset = { _id: assetId, key: 'k1', contentType: 'image/png', originalName: 't.png' };
      Asset.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockAsset) });
      objectStorage.getObject.mockResolvedValue({ body: Buffer.from('data') });

      await controller.download(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'image/png');
    });
  });
});
