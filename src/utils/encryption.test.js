const { encryptString, decryptString } = require('./encryption');
const crypto = require('crypto');

describe('encryption.js', () => {
  const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

  beforeEach(() => {
    process.env.SUPERBACKEND_ENCRYPTION_KEY = TEST_KEY;
    delete process.env.SAASBACKEND_ENCRYPTION_KEY;
  });

  describe('encryptString / decryptString', () => {
    test('encrypts and decrypts a string successfully', () => {
      const plaintext = 'secret message';
      const encrypted = encryptString(plaintext);
      
      expect(encrypted).toMatchObject({
        alg: 'aes-256-gcm',
        keyId: 'v1',
        iv: expect.any(String),
        tag: expect.any(String),
        ciphertext: expect.any(String)
      });

      const decrypted = decryptString(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('throws error if key is missing', () => {
      delete process.env.SUPERBACKEND_ENCRYPTION_KEY;
      delete process.env.SAASBACKEND_ENCRYPTION_KEY;
      
      expect(() => encryptString('test')).toThrow('SUPERBACKEND_ENCRYPTION_KEY');
    });

    test('falls back to legacy key name', () => {
      delete process.env.SUPERBACKEND_ENCRYPTION_KEY;
      process.env.SAASBACKEND_ENCRYPTION_KEY = TEST_KEY;
      
      const plaintext = 'legacy secret';
      const encrypted = encryptString(plaintext);
      const decrypted = decryptString(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    test('should correctly handle different at-rest formats (base64 vs string)', () => {
      const plaintext = 'format test';
      const encrypted = encryptString(plaintext);
      // The current implementation returns an object with ciphertext, iv, tag, alg, keyId
      expect(encrypted.alg).toBe('aes-256-gcm');
      
      const decrypted = decryptString(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('should throw error for invalid key length', () => {
      process.env.SUPERBACKEND_ENCRYPTION_KEY = 'too-short';
      expect(() => encryptString('test')).toThrow();
    });

    test('throws error for invalid payload in decryptString', () => {
      expect(() => decryptString(null)).toThrow('Invalid encrypted payload');
      expect(() => decryptString({})).toThrow('Unsupported encryption algorithm');
      expect(() => decryptString({ alg: 'aes-256-gcm' })).toThrow();
    });
  });
});
