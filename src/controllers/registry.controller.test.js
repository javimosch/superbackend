const controller = require('./registry.controller');
const { handleError } = controller._testHelpers;

describe('registry.controller', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('handleError', () => {
    test('returns 400 with INVALID_REQUEST for VALIDATION code', () => {
      handleError(mockRes, { code: 'VALIDATION', message: 'Bad input' });
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'INVALID_REQUEST', message: 'Bad input' },
      });
    });

    test('returns 404 for NOT_FOUND code', () => {
      handleError(mockRes, { code: 'NOT_FOUND', message: 'Missing' });
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'NOT_FOUND', message: 'Missing' },
      });
    });

    test('returns 500 for unknown code', () => {
      handleError(mockRes, { code: 'OTHER', message: 'Boom' });
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'INTERNAL_ERROR', message: 'Boom' },
      });
    });

    test('uses fallback message when error message is missing', () => {
      handleError(mockRes, { code: 'NOT_FOUND' });
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'NOT_FOUND', message: 'Operation failed' },
      });
    });

    test('uses fallback for null/undefined error', () => {
      handleError(mockRes, null);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: { code: 'INTERNAL_ERROR', message: 'Operation failed' },
      });
    });
  });
});
