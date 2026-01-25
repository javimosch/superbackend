const controller = require('./adminJsonConfigs.controller');
const jsonConfigsService = require('../services/jsonConfigs.service');

jest.mock('../services/jsonConfigs.service');

describe('adminJsonConfigs.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('list', () => {
    test('returns all JSON configs', async () => {
      const mockItems = [{ slug: 'config1' }, { slug: 'config2' }];
      jsonConfigsService.listJsonConfigs.mockResolvedValue(mockItems);

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
    });
  });

  describe('get', () => {
    test('returns single JSON config', async () => {
      mockReq.params.id = 'id123';
      const mockItem = { _id: 'id123', slug: 'config1' };
      jsonConfigsService.getJsonConfigById.mockResolvedValue(mockItem);

      await controller.get(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });

    test('returns 404 if not found', async () => {
      mockReq.params.id = 'missing';
      jsonConfigsService.getJsonConfigById.mockResolvedValue(null);

      await controller.get(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('create', () => {
    test('creates new config', async () => {
      mockReq.body = { title: 'New', jsonRaw: '{}' };
      const mockItem = { _id: 'new-id', ...mockReq.body };
      jsonConfigsService.createJsonConfig.mockResolvedValue(mockItem);

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });
  });

  describe('clearCache', () => {
    test('clears cache for specific config', async () => {
      mockReq.params.id = 'id123';
      jsonConfigsService.getJsonConfigById.mockResolvedValue({ slug: 'config1' });

      await controller.clearCache(mockReq, mockRes);

      expect(jsonConfigsService.clearJsonConfigCache).toHaveBeenCalledWith('config1');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
