const { extractToken, getOperationFromMethod } = require('./headlessApiTokenAuth');

describe('headlessApiTokenAuth', () => {
  describe('extractToken', () => {
    test('extracts from x-api-token header', () => {
      const req = { headers: { 'x-api-token': ' my-token ' } };
      expect(extractToken(req)).toBe('my-token');
    });

    test('extracts from x-api-key header', () => {
      const req = { headers: { 'x-api-key': 'api-key-value' } };
      expect(extractToken(req)).toBe('api-key-value');
    });

    test('prefers x-api-token over x-api-key', () => {
      const req = { headers: { 'x-api-token': 'preferred', 'x-api-key': 'ignored' } };
      expect(extractToken(req)).toBe('preferred');
    });

    test('extracts from Bearer authorization header', () => {
      const req = { headers: { authorization: 'Bearer token-from-bearer' } };
      expect(extractToken(req)).toBe('token-from-bearer');
    });

    test('handles case-insensitive Bearer prefix', () => {
      const req = { headers: { authorization: 'bearer lowercase-bearer' } };
      expect(extractToken(req)).toBe('lowercase-bearer');
    });

    test('returns null when no auth headers present', () => {
      const req = { headers: {} };
      expect(extractToken(req)).toBeNull();
    });

    test('returns null when authorization is not Bearer', () => {
      const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
      expect(extractToken(req)).toBeNull();
    });

    test('handles Bearer token with surrounding whitespace', () => {
      const req = { headers: { authorization: 'Bearer   spaced-token   ' } };
      expect(extractToken(req)).toBe('spaced-token');
    });

    test('returns null for empty Bearer token', () => {
      const req = { headers: { authorization: 'Bearer ' } };
      expect(extractToken(req)).toBeNull();
    });
  });

  describe('getOperationFromMethod', () => {
    test('GET returns read', () => {
      expect(getOperationFromMethod('GET')).toBe('read');
    });

    test('POST returns create', () => {
      expect(getOperationFromMethod('POST')).toBe('create');
    });

    test('PUT returns update', () => {
      expect(getOperationFromMethod('PUT')).toBe('update');
    });

    test('PATCH returns update', () => {
      expect(getOperationFromMethod('PATCH')).toBe('update');
    });

    test('DELETE returns delete', () => {
      expect(getOperationFromMethod('DELETE')).toBe('delete');
    });

    test('handles lowercase method', () => {
      expect(getOperationFromMethod('get')).toBe('read');
    });

    test('returns null for unknown method', () => {
      expect(getOperationFromMethod('OPTIONS')).toBeNull();
    });

    test('returns null for null/undefined method', () => {
      expect(getOperationFromMethod(null)).toBeNull();
      expect(getOperationFromMethod(undefined)).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(getOperationFromMethod('')).toBeNull();
    });
  });
});
