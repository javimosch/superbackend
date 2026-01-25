const controller = require('./i18n.controller');
const i18nService = require('../services/i18n.service');

jest.mock('../services/i18n.service');

describe('i18n.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('getBundle', () => {
    test('returns i18n bundle for a locale', async () => {
      mockReq.query.locale = 'fr';
      const mockBundle = { locale: 'fr', entries: { hello: 'Bonjour' } };
      i18nService.getBundle.mockResolvedValue(mockBundle);

      await controller.getBundle(mockReq, mockRes);

      expect(i18nService.getBundle).toHaveBeenCalledWith('fr');
      expect(mockRes.json).toHaveBeenCalledWith(mockBundle);
    });

    test('handles errors from i18nService', async () => {
      i18nService.getBundle.mockRejectedValue(new Error('service error'));

      await controller.getBundle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to build i18n bundle' });
    });
  });
});
