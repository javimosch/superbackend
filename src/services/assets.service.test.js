const Asset = require('../models/Asset');
const objectStorage = require('./objectStorage.service');
const { 
  getAssetById, 
  getAssetByKey, 
  listAssets, 
  getAssetBytesById, 
  getAssetBytesByKey 
} = require('./assets.service');

jest.mock('../models/Asset', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('./objectStorage.service', () => ({
  getObject: jest.fn()
}));

describe('assets.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAssetById', () => {
    test('returns asset when found and status matches', async () => {
      const mockAsset = { 
        _id: 'asset123', 
        status: 'uploaded', 
        toObject: jest.fn().mockReturnValue({ _id: 'asset123', status: 'uploaded' }) 
      };
      Asset.findById.mockResolvedValue(mockAsset);

      const result = await getAssetById('asset123');

      expect(Asset.findById).toHaveBeenCalledWith('asset123');
      expect(result).toEqual({ _id: 'asset123', status: 'uploaded' });
    });

    test('throws error when asset not found', async () => {
      Asset.findById.mockResolvedValue(null);

      await expect(getAssetById('missing')).rejects.toThrow('Asset not found');
    });

    test('throws error when status does not match', async () => {
      const mockAsset = { _id: 'asset123', status: 'pending' };
      Asset.findById.mockResolvedValue(mockAsset);

      await expect(getAssetById('asset123', { status: 'uploaded' })).rejects.toThrow('Asset not found');
    });
  });

  describe('getAssetByKey', () => {
    test('returns asset when found by key', async () => {
      const mockAsset = { 
        key: 'test.jpg', 
        status: 'uploaded', 
        toObject: jest.fn().mockReturnValue({ key: 'test.jpg', status: 'uploaded' }) 
      };
      Asset.findOne.mockResolvedValue(mockAsset);

      const result = await getAssetByKey('test.jpg');

      expect(Asset.findOne).toHaveBeenCalledWith({ key: 'test.jpg' });
      expect(result).toEqual({ key: 'test.jpg', status: 'uploaded' });
    });
  });

  describe('listAssets', () => {
    test('lists assets with filters and pagination', async () => {
      const mockAssets = [{ _id: '1' }, { _id: '2' }];
      Asset.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAssets)
      });
      Asset.countDocuments.mockResolvedValue(2);

      const result = await listAssets({ namespace: 'test', page: 1, limit: 10 });

      expect(Asset.find).toHaveBeenCalledWith(expect.objectContaining({ namespace: 'test' }));
      expect(result.assets).toEqual(mockAssets);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1
      });
    });
  });

  describe('getAssetBytesById', () => {
    test('returns asset metadata and bytes', async () => {
      const mockAsset = { 
        _id: 'asset123', 
        key: 'file.png',
        status: 'uploaded', 
        contentType: 'image/png',
        toObject: jest.fn().mockReturnValue({ _id: 'asset123', key: 'file.png', status: 'uploaded', contentType: 'image/png' }) 
      };
      Asset.findById.mockResolvedValue(mockAsset);
      objectStorage.getObject.mockResolvedValue({ body: Buffer.from('test'), contentType: 'image/png' });

      const result = await getAssetBytesById('asset123');

      expect(result.body.toString()).toBe('test');
      expect(result.contentType).toBe('image/png');
    });

    test('throws error if storage body missing', async () => {
      const mockAsset = { 
        _id: 'asset123', 
        key: 'file.png',
        status: 'uploaded', 
        toObject: jest.fn().mockReturnValue({ _id: 'asset123', key: 'file.png', status: 'uploaded' }) 
      };
      Asset.findById.mockResolvedValue(mockAsset);
      objectStorage.getObject.mockResolvedValue({ body: null });

      await expect(getAssetBytesById('asset123')).rejects.toThrow('File not found in storage');
    });
  });
});
