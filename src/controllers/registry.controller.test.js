const registryService = require('../services/registry.service');
const controller = require('./registry.controller');

jest.mock('../services/registry.service');

describe('registry.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      query: {},
      headers: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('auth', () => {
    test('returns auth status on success', async () => {
      mockReq.params.id = 'reg-1';
      mockReq.headers.authorization = 'Bearer token123';
      registryService.getAuthStatus.mockResolvedValue({ authenticated: true });

      await controller.auth(mockReq, mockRes);

      expect(registryService.getAuthStatus).toHaveBeenCalledWith('reg-1', 'Bearer token123');
      expect(mockRes.json).toHaveBeenCalledWith({ authenticated: true });
    });

    test('returns 400 on VALIDATION error', async () => {
      const err = new Error('Invalid request');
      err.code = 'VALIDATION';
      registryService.getAuthStatus.mockRejectedValue(err);

      await controller.auth(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'INVALID_REQUEST', message: 'Invalid request' },
      });
    });

    test('returns 404 on NOT_FOUND error', async () => {
      const err = new Error('Registry not found');
      err.code = 'NOT_FOUND';
      registryService.getAuthStatus.mockRejectedValue(err);

      await controller.auth(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'NOT_FOUND', message: 'Registry not found' },
      });
    });

    test('returns 500 on unexpected error', async () => {
      registryService.getAuthStatus.mockRejectedValue(new Error('db exploded'));

      await controller.auth(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'INTERNAL_ERROR', message: 'db exploded' },
      });
    });
  });

  describe('list', () => {
    test('returns list of items on success', async () => {
      mockReq.params.id = 'reg-1';
      mockReq.query = { limit: '10' };
      mockReq.headers.authorization = 'Bearer token123';
      registryService.listItemsForRegistry.mockResolvedValue({ items: [], total: 0 });

      await controller.list(mockReq, mockRes);

      expect(registryService.listItemsForRegistry).toHaveBeenCalledWith(
        'reg-1',
        { limit: '10' },
        'Bearer token123',
      );
      expect(mockRes.json).toHaveBeenCalledWith({ items: [], total: 0 });
    });

    test('returns 400 on VALIDATION error', async () => {
      const err = new Error('Bad query');
      err.code = 'VALIDATION';
      registryService.listItemsForRegistry.mockRejectedValue(err);

      await controller.list(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'INVALID_REQUEST', message: 'Bad query' },
      });
    });
  });
});
