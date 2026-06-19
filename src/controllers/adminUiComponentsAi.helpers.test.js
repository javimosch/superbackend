const { handleError } = require('./adminUiComponentsAi.controller')._testHelpers;

describe('adminUiComponentsAi.controller helpers', () => {
  describe('handleError', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
    });

    test('returns 400 for VALIDATION code', () => {
      const err = { code: 'VALIDATION', message: 'Invalid input' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid input' });
    });

    test('returns 404 for NOT_FOUND code', () => {
      const err = { code: 'NOT_FOUND', message: 'Resource not found' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Resource not found' });
    });

    test('returns 500 for AI_INVALID code', () => {
      const err = { code: 'AI_INVALID', message: 'AI service error' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'AI service error' });
    });

    test('returns 500 for other error codes', () => {
      const err = { code: 'UNKNOWN_ERROR', message: 'Something went wrong' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Something went wrong' });
    });

    test('returns 500 for errors without code', () => {
      const err = { message: 'Generic error' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Generic error' });
    });

    test('uses fallback message when error message is missing', () => {
      const err = { code: 'UNKNOWN_ERROR' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });

    test('uses fallback message when error is null', () => {
      handleError(mockRes, null);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });

    test('uses fallback message when error is undefined', () => {
      handleError(mockRes, undefined);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });
  });
});
