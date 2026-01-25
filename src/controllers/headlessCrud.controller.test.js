const controller = require('./headlessCrud.controller');
const { getDynamicModel } = require('../services/headlessModels.service');
const mongoose = require('mongoose');

jest.mock('../services/headlessModels.service');

describe('headlessCrud.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: { modelCode: 'test' },
      query: {},
      body: {},
      method: 'GET'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('list', () => {
    test('lists items from dynamic model', async () => {
      const mockModel = {
        find: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: '1' }]),
        countDocuments: jest.fn().mockResolvedValue(1),
      };
      getDynamicModel.mockResolvedValue(mockModel);

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        items: expect.any(Array),
        total: 1
      }));
    });
  });

  describe('create', () => {
    test('creates a new item in dynamic model', async () => {
      mockReq.body = { name: 'New Item' };
      const mockModel = {
        create: jest.fn().mockResolvedValue({
          toObject: () => ({ _id: '1', name: 'New Item' })
        })
      };
      getDynamicModel.mockResolvedValue(mockModel);

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ item: expect.objectContaining({ name: 'New Item' }) });
    });
  });

  describe('get', () => {
    test('retrieves single item by id', async () => {
      mockReq.params.id = 'id123';
      const mockModel = {
        findById: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'id123' })
      };
      getDynamicModel.mockResolvedValue(mockModel);

      await controller.get(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: { _id: 'id123' } });
    });

    test('returns 404 if item not found', async () => {
      mockReq.params.id = 'missing';
      const mockModel = {
        findById: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      };
      getDynamicModel.mockResolvedValue(mockModel);

      await controller.get(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('update', () => {
    test('updates item by id', async () => {
      mockReq.params.id = 'id123';
      mockReq.body = { name: 'Updated' };
      const mockModel = {
        findByIdAndUpdate: jest.fn().mockResolvedValue({
          toObject: () => ({ _id: 'id123', name: 'Updated' })
        })
      };
      getDynamicModel.mockResolvedValue(mockModel);

      await controller.update(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: expect.objectContaining({ name: 'Updated' }) });
    });
  });

  describe('remove', () => {
    test('deletes item by id', async () => {
      mockReq.params.id = 'id123';
      const mockModel = {
        findByIdAndDelete: jest.fn().mockResolvedValue({ _id: 'id123' })
      };
      getDynamicModel.mockResolvedValue(mockModel);

      await controller.remove(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
