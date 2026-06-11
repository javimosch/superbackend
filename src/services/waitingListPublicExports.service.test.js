jest.mock('bcryptjs');
jest.mock('./jsonConfigs.service');
jest.mock('./auditLogger');

const {
  generateName,
  generateUniqueName,
  validateExportConfig,
  validateExportPassword,
  hashPassword,
} = require('./waitingListPublicExports.service');

describe('waitingListPublicExports.service', () => {
  describe('generateName', () => {
    test('returns an adjective-animal string', () => {
      const name = generateName();
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
    });

    test('returns different names on successive calls', () => {
      const names = new Set(Array.from({ length: 10 }, () => generateName()));
      expect(names.size).toBeGreaterThan(1);
    });
  });

  describe('generateUniqueName', () => {
    test('returns a name not in the existing list', async () => {
      const name = await generateUniqueName(['black-bear', 'red-fox']);
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
      expect(name).not.toBe('black-bear');
      expect(name).not.toBe('red-fox');
    });

    test('returns quickly when existing list is empty', async () => {
      const name = await generateUniqueName([]);
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
    });
  });

  describe('validateExportConfig', () => {
    test('throws for null/undefined input', () => {
      expect(() => validateExportConfig(null)).toThrow('Export configuration must be an object');
      expect(() => validateExportConfig(undefined)).toThrow('Export configuration must be an object');
    });

    test('throws for non-object input', () => {
      expect(() => validateExportConfig('string')).toThrow('Export configuration must be an object');
    });

    test('throws without name', () => {
      expect(() => validateExportConfig({ type: 'csv' })).toThrow('Name is required');
    });

    test('throws without type', () => {
      expect(() => validateExportConfig({ name: 'test' })).toThrow('Type is required');
    });

    test('throws for invalid format', () => {
      expect(() => validateExportConfig({ name: 'test', type: 'manual', format: 'xml' })).toThrow(
        'Format must be either "csv" or "json"',
      );
    });

    test('returns normalized config for csv', () => {
      const result = validateExportConfig({ name: 'my-export', type: 'manual', format: 'csv' });
      expect(result).toMatchObject({
        name: 'my-export',
        type: 'manual',
        format: 'csv',
      });
      expect(result.id).toMatch(/^[a-f0-9]{32}$/);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    test('defaults format to csv', () => {
      const result = validateExportConfig({ name: 'test', type: 'auto' });
      expect(result.format).toBe('csv');
    });

    test('trims name and type', () => {
      const result = validateExportConfig({ name: '  spaced-name  ', type: '  csv  ' });
      expect(result.name).toBe('spaced-name');
      expect(result.type).toBe('csv');
    });

    test('accepts json format', () => {
      const result = validateExportConfig({ name: 'test', type: 'auto', format: 'json' });
      expect(result.format).toBe('json');
    });

    test('preserves provided id', () => {
      const result = validateExportConfig({ name: 'test', type: 'auto', id: 'custom-id' });
      expect(result.id).toBe('custom-id');
    });

    test('preserves provided password', () => {
      const result = validateExportConfig({ name: 'test', type: 'auto', password: 'secret' });
      expect(result.password).toBe('secret');
    });
  });

  describe('validateExportPassword (mocked bcrypt)', () => {
    const bcrypt = require('bcryptjs');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('returns true when export has no password', async () => {
      const result = await validateExportPassword({ name: 'test' }, 'anything');
      expect(result).toBe(true);
    });

    test('returns false when export has password but none provided', async () => {
      const result = await validateExportPassword({ name: 'test', password: '$2a$10$xxx' }, null);
      expect(result).toBe(false);
    });

    test('returns bcrypt comparison result', async () => {
      bcrypt.compare.mockResolvedValue(true);
      const result = await validateExportPassword(
        { name: 'test', password: '$2a$10$hash' },
        'correct',
      );
      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('correct', '$2a$10$hash');
    });

    test('returns false on bcrypt error', async () => {
      bcrypt.compare.mockRejectedValue(new Error('bcrypt error'));
      const result = await validateExportPassword(
        { name: 'test', password: '$2a$10$hash' },
        'wrong',
      );
      expect(result).toBe(false);
    });
  });

  describe('hashPassword (mocked bcrypt)', () => {
    const bcrypt = require('bcryptjs');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('returns null for empty password', async () => {
      const result = await hashPassword(null);
      expect(result).toBeNull();
    });

    test('returns hashed password', async () => {
      bcrypt.hash.mockResolvedValue('$2a$10$hashed_value');
      const result = await hashPassword('secret');
      expect(result).toBe('$2a$10$hashed_value');
      expect(bcrypt.hash).toHaveBeenCalledWith('secret', 10);
    });

    test('throws on bcrypt error', async () => {
      bcrypt.hash.mockRejectedValue(new Error('hashing error'));
      await expect(hashPassword('secret')).rejects.toThrow('Failed to hash password');
    });
  });
});
