const { handleError } = require('./registry.controller')._testHelpers;

function mockRes() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { status, json };
}

describe('registry.controller helpers', () => {
  describe('handleError', () => {
    test('returns 400 for VALIDATION errors', () => {
      const res = mockRes();
      handleError(res, { code: 'VALIDATION', message: 'Invalid input' });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: { code: 'INVALID_REQUEST', message: 'Invalid input' } });
    });

    test('returns 404 for NOT_FOUND errors', () => {
      const res = mockRes();
      handleError(res, { code: 'NOT_FOUND', message: 'Missing item' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'Missing item' } });
    });

    test('returns 500 for unknown errors', () => {
      const res = mockRes();
      handleError(res, new Error('Something broke'));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: { code: 'INTERNAL_ERROR', message: 'Something broke' } });
    });

    test('uses default message when error has none', () => {
      const res = mockRes();
      handleError(res, {});
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: { code: 'INTERNAL_ERROR', message: 'Operation failed' } });
    });
  });
});
