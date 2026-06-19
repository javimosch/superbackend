const { handleError } = require('./adminTerminals.controller')._testHelpers;

describe('adminTerminals.controller helpers', () => {
  describe('handleError', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
    });

    test('returns 404 for NOT_FOUND code', () => {
      const err = { code: 'NOT_FOUND', message: 'Session not found' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session not found' });
    });

    test('returns 429 for LIMIT code', () => {
      const err = { code: 'LIMIT', message: 'Rate limit exceeded' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Rate limit exceeded' });
    });

    test('returns 500 for other error codes', () => {
      const err = { code: 'INTERNAL_ERROR', message: 'Internal server error' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    test('returns 500 for errors without code', () => {
      const err = { message: 'Generic error' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Generic error' });
    });

    test('uses fallback message when error message is missing', () => {
      const err = { code: 'NOT_FOUND' };
      handleError(mockRes, err);
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });

    test('uses fallback message when error is null/undefined', () => {
      handleError(mockRes, null);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });

    test('uses fallback message when error is empty object', () => {
      handleError(mockRes, {});
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });
  });
});
