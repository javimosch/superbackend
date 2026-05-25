jest.mock('../services/headlessModels.service', () => ({
  getDynamicModel: jest.fn()
}));

const { create, update, _getOperationFromRequest } = require('./headlessCrud.controller');
const { getDynamicModel } = require('../services/headlessModels.service');

describe('headlessCrud.controller', () => {
  let mockReq, mockRes, mockModel;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: { modelCode: 'test-model', id: '507f1f77bcf86cd799439011' },
      body: { name: 'test', email: 'test@test.com' }
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };

    mockModel = {
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn()
    };
    getDynamicModel.mockResolvedValue(mockModel);
  });

  describe('create', () => {
    test('creates document with sanitized body', async () => {
      const doc = { toObject: () => ({ _id: 'abc', name: 'test', email: 'test@test.com' }) };
      mockModel.create.mockResolvedValue(doc);

      await create(mockReq, mockRes);

      expect(getDynamicModel).toHaveBeenCalledWith('test-model');
      expect(mockModel.create).toHaveBeenCalledWith({ name: 'test', email: 'test@test.com' });
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ item: { _id: 'abc', name: 'test', email: 'test@test.com' } });
    });

    test('strips internal mongodb fields from body', async () => {
      mockReq.body = { name: 'test', __v: 1, _id: 'should-not-pass', $where: 'evil' };
      const doc = { toObject: () => ({ name: 'test' }) };
      mockModel.create.mockResolvedValue(doc);

      await create(mockReq, mockRes);

      expect(mockModel.create).toHaveBeenCalledWith({ name: 'test' });
    });

    test('handles empty body', async () => {
      mockReq.body = {};
      const doc = { toObject: () => ({}) };
      mockModel.create.mockResolvedValue(doc);

      await create(mockReq, mockRes);

      expect(mockModel.create).toHaveBeenCalledWith({});
    });

    test('handles null body', async () => {
      mockReq.body = null;
      const doc = { toObject: () => ({}) };
      mockModel.create.mockResolvedValue(doc);

      await create(mockReq, mockRes);

      expect(mockModel.create).toHaveBeenCalledWith({});
    });

    test('returns 500 on error', async () => {
      mockModel.create.mockRejectedValue(new Error('DB error'));

      await create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to create item' });
    });
  });

  describe('update', () => {
    test('updates document with sanitized body', async () => {
      const doc = { toObject: () => ({ _id: 'abc', name: 'updated' }) };
      mockModel.findByIdAndUpdate.mockResolvedValue(doc);

      await update(mockReq, mockRes);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { name: 'test', email: 'test@test.com' },
        { new: true, runValidators: false }
      );
      expect(mockRes.json).toHaveBeenCalledWith({ item: { _id: 'abc', name: 'updated' } });
    });

    test('strips internal fields during update', async () => {
      mockReq.body = { name: 'updated', __v: 1, $set: { bad: true } };
      const doc = { toObject: () => ({ name: 'updated' }) };
      mockModel.findByIdAndUpdate.mockResolvedValue(doc);

      await update(mockReq, mockRes);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { name: 'updated' },
        expect.any(Object)
      );
    });

    test('returns 404 when document not found', async () => {
      mockModel.findByIdAndUpdate.mockResolvedValue(null);

      await update(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Item not found' });
    });
  });

  describe('_getOperationFromRequest', () => {
    test('returns correct operation for HTTP methods', () => {
      expect(_getOperationFromRequest({ method: 'GET' })).toBe('read');
      expect(_getOperationFromRequest({ method: 'POST' })).toBe('create');
      expect(_getOperationFromRequest({ method: 'PUT' })).toBe('update');
      expect(_getOperationFromRequest({ method: 'PATCH' })).toBe('update');
      expect(_getOperationFromRequest({ method: 'DELETE' })).toBe('delete');
    });
  });
});
