const { 
  generateApiTokenPlaintext, 
  hashToken, 
  timingSafeEqualHex 
} = require('./headlessCrypto.service');

describe('headlessCrypto.service', () => {
  describe('generateApiTokenPlaintext', () => {
    test('generates a key with hcms_ prefix', () => {
      const key = generateApiTokenPlaintext();
      expect(key).toMatch(/^hcms_[A-Za-z0-9\-_]+$/);
    });
  });

  describe('hashToken', () => {
    test('correctly hashes a token', () => {
      const token = 'hcms_test_token_123';
      const hash = hashToken(token);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 hex length
    });
  });

  describe('timingSafeEqualHex', () => {
    test('returns true for identical hex strings', () => {
      const a = 'abc1234567890abcdef';
      const b = 'abc1234567890abcdef';
      expect(timingSafeEqualHex(a, b)).toBe(true);
    });

    test('returns false for different hex strings', () => {
      expect(timingSafeEqualHex('abc', 'def')).toBe(false);
    });

    test('returns false for different lengths', () => {
      expect(timingSafeEqualHex('abc', 'abcd')).toBe(false);
    });
  });
});
