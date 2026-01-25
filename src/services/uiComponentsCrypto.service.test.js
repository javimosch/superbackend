const { 
  generateProjectApiKeyPlaintext, 
  hashKey, 
  timingSafeEqualHex, 
  verifyKey 
} = require('./uiComponentsCrypto.service');

describe('uiComponentsCrypto.service', () => {
  describe('generateProjectApiKeyPlaintext', () => {
    test('generates a key with uk_ prefix', () => {
      const key = generateProjectApiKeyPlaintext();
      expect(key).toMatch(/^uk_[A-Za-z0-9\-_]+$/);
    });
  });

  describe('hashKey and verifyKey', () => {
    test('correctly hashes and verifies a key', () => {
      const key = 'uk_test_key_123';
      const hash = hashKey(key);
      expect(verifyKey(key, hash)).toBe(true);
    });

    test('returns false for invalid key', () => {
      const key = 'uk_test_key_123';
      const hash = hashKey(key);
      expect(verifyKey('uk_wrong_key', hash)).toBe(false);
    });

    test('returns false for empty input', () => {
      expect(verifyKey('', 'somehash')).toBe(false);
      expect(verifyKey(null, 'somehash')).toBe(false);
    });
  });

  describe('timingSafeEqualHex', () => {
    test('returns true for identical hex strings', () => {
      const a = 'abc123';
      const b = 'abc123';
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
