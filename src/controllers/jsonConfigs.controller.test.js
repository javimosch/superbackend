const jsonConfigsService = require('../services/jsonConfigs.service');
const controller = require('./jsonConfigs.controller');

jest.mock('../services/jsonConfigs.service');

describe('jsonConfigs.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('getPublic', () => {
    test('returns json payload on success', async () => {
      mockReq.params.slug = 'my-config';
      jsonConfigsService.getJsonConfigPublicPayload.mockResolvedValue({ key: 'value' });

      await controller.getPublic(mockReq, mockRes);

      expect(jsonConfigsService.getJsonConfigPublicPayload).toHaveBeenCalledWith('my-config', { raw: false });
      expect(mockRes.json).toHaveBeenCalledWith({ key: 'value' });
    });

    test('passes raw flag when query param is true', async () => {
      mockReq.params.slug = 'my-config';
      mockReq.query.raw = 'true';
      jsonConfigsService.getJsonConfigPublicPayload.mockResolvedValue({ data: 'raw' });

      await controller.getPublic(mockReq, mockRes);

      expect(jsonConfigsService.getJsonConfigPublicPayload).toHaveBeenCalledWith('my-config', { raw: true });
    });

    test('returns 404 when config not found', async () => {
      mockReq.params.slug = 'missing';
      const err = new Error('JSON config not found');
      err.code = 'NOT_FOUND';
      jsonConfigsService.getJsonConfigPublicPayload.mockRejectedValue(err);

      await controller.getPublic(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    test('returns 500 on unexpected error', async () => {
      mockReq.params.slug = 'broken';
      jsonConfigsService.getJsonConfigPublicPayload.mockRejectedValue(new Error('db exploded'));

      await controller.getPublic(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'db exploded' });
    });

    test('handles missing slug gracefully', async () => {
      jsonConfigsService.getJsonConfigPublicPayload.mockResolvedValue(null);

      await controller.getPublic(mockReq, mockRes);

      expect(jsonConfigsService.getJsonConfigPublicPayload).toHaveBeenCalledWith('', { raw: false });
      expect(mockRes.json).toHaveBeenCalledWith(null);
    });
  });
});
