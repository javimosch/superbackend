const ExternalDbConnection = require('./ExternalDbConnection');

describe('ExternalDbConnection Model', () => {
  describe('Schema validation', () => {
    test('should be valid with required fields', () => {
      const doc = new ExternalDbConnection({
        name: 'prod-mongo',
        type: 'mongo',
        uriEncrypted: { alg: 'aes-256-gcm', keyId: 'v1', iv: 'x', tag: 'y', ciphertext: 'z' },
        uriMasked: 'mongodb://***:***@host/db',
      });

      const err = doc.validateSync();
      expect(err).toBeUndefined();
    });

    test('should require name', () => {
      const doc = new ExternalDbConnection({
        type: 'mongo',
        uriEncrypted: { alg: 'aes-256-gcm', keyId: 'v1', iv: 'x', tag: 'y', ciphertext: 'z' },
      });
      const err = doc.validateSync();
      expect(err.errors.name).toBeDefined();
    });

    test('should enforce type enum', () => {
      const doc = new ExternalDbConnection({
        name: 'bad',
        type: 'postgres',
        uriEncrypted: { alg: 'aes-256-gcm', keyId: 'v1', iv: 'x', tag: 'y', ciphertext: 'z' },
      });
      const err = doc.validateSync();
      expect(err.errors.type).toBeDefined();
    });

    test('should require uriEncrypted', () => {
      const doc = new ExternalDbConnection({
        name: 'no-uri',
        type: 'mysql',
      });
      const err = doc.validateSync();
      expect(err.errors.uriEncrypted).toBeDefined();
    });
  });

  describe('toJSON', () => {
    test('should exclude uriEncrypted from JSON output', () => {
      const doc = new ExternalDbConnection({
        name: 'prod-mysql',
        type: 'mysql',
        uriEncrypted: { alg: 'aes-256-gcm', keyId: 'v1', iv: 'x', tag: 'y', ciphertext: 'z' },
      });

      const json = doc.toJSON();
      expect(json.uriEncrypted).toBeUndefined();
      expect(json.__v).toBeUndefined();
      expect(json.name).toBe('prod-mysql');
      expect(json.type).toBe('mysql');
    });
  });
});
