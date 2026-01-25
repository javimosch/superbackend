const controller = require('./adminBlockDefinitions.controller');
const BlockDefinition = require('../models/BlockDefinition');

jest.mock('../models/BlockDefinition');

describe('adminBlockDefinitions.controller', () => {
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
    test('returns all block definitions', async () => {
      const mockItems = [{ code: 'hero', label: 'Hero' }];
      BlockDefinition.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockItems)
      });

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
    });

    test('filters by active status', async () => {
      mockReq.query.active = 'true';
      BlockDefinition.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      await controller.list(mockReq, mockRes);

      expect(BlockDefinition.find).toHaveBeenCalledWith({ isActive: true });
    });
  });

  describe('create', () => {
    test('creates new block definition successfully', async () => {
      mockReq.body = {
        code: 'text',
        label: 'Text Block',
        fields: { content: { type: 'html' } }
      };

      const mockDoc = {
        ...mockReq.body,
        _id: 'b1',
        toObject: () => ({ ...mockReq.body, _id: 'b1' })
      };
      BlockDefinition.create.mockResolvedValue(mockDoc);

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ item: expect.objectContaining({ code: 'text' }) });
    });

    test('returns 400 if code or label missing', async () => {
      mockReq.body = { label: 'Missing Code' };
      await controller.create(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('get', () => {
    test('returns single block definition', async () => {
      mockReq.params.code = 'hero';
      const mockItem = { code: 'hero', label: 'Hero' };
      BlockDefinition.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockItem) });

      await controller.get(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });

    test('returns 404 if not found', async () => {
      mockReq.params.code = 'missing';
      BlockDefinition.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await controller.get(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('update', () => {
    test('updates block definition successfully', async () => {
      mockReq.params.code = 'hero';
      mockReq.body = { label: 'New Hero' };
      
      const mockDoc = {
        code: 'hero',
        label: 'Old Hero',
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };
      BlockDefinition.findOne.mockResolvedValue(mockDoc);

      await controller.update(mockReq, mockRes);

      expect(mockDoc.label).toBe('New Hero');
      expect(mockDoc.save).toHaveBeenCalled();
    });
  });
});
