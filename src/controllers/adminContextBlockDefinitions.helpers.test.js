const { parseBool, normalizeCode, normalizeProps, normalizeType } = require('./adminContextBlockDefinitions.controller')._testHelpers;

describe('adminContextBlockDefinitions.controller helpers', () => {
  describe('parseBool', () => {
    test('handles boolean true', () => {
      expect(parseBool(true, false)).toBe(true);
    });

    test('handles boolean false', () => {
      expect(parseBool(false, true)).toBe(false);
    });

    test('handles string "true"', () => {
      expect(parseBool('true', false)).toBe(true);
    });

    test('handles string "false"', () => {
      expect(parseBool('false', true)).toBe(false);
    });

    test('handles string "1"', () => {
      expect(parseBool('1', false)).toBe(true);
    });

    test('handles string "0"', () => {
      expect(parseBool('0', true)).toBe(false);
    });

    test('handles string "yes"', () => {
      expect(parseBool('yes', false)).toBe(true);
    });

    test('handles string "no"', () => {
      expect(parseBool('no', true)).toBe(false);
    });

    test('handles case-insensitive strings', () => {
      expect(parseBool('TRUE', false)).toBe(true);
      expect(parseBool('False', true)).toBe(false);
      expect(parseBool('YES', false)).toBe(true);
      expect(parseBool('NO', true)).toBe(false);
    });

    test('handles strings with whitespace', () => {
      expect(parseBool(' true ', false)).toBe(true);
      expect(parseBool(' false ', true)).toBe(false);
    });

    test('returns fallback for undefined', () => {
      expect(parseBool(undefined, true)).toBe(true);
      expect(parseBool(undefined, false)).toBe(false);
    });

    test('returns fallback for invalid strings', () => {
      expect(parseBool('invalid', true)).toBe(true);
      expect(parseBool('invalid', false)).toBe(false);
    });

    test('returns fallback for other types', () => {
      expect(parseBool(123, true)).toBe(true);
      expect(parseBool({}, false)).toBe(false);
      expect(parseBool([], true)).toBe(true);
    });
  });

  describe('normalizeCode', () => {
    test('trims and lowercases strings', () => {
      expect(normalizeCode('  TestCode  ')).toBe('testcode');
    });

    test('handles uppercase', () => {
      expect(normalizeCode('TESTCODE')).toBe('testcode');
    });

    test('handles mixed case', () => {
      expect(normalizeCode('TestCode')).toBe('testcode');
    });

    test('handles empty string', () => {
      expect(normalizeCode('')).toBe('');
    });

    test('handles whitespace-only string', () => {
      expect(normalizeCode('   ')).toBe('');
    });

    test('handles null/undefined', () => {
      expect(normalizeCode(null)).toBe('');
      expect(normalizeCode(undefined)).toBe('');
    });

    test('handles numbers', () => {
      expect(normalizeCode(123)).toBe('123');
    });
  });

  describe('normalizeProps', () => {
    test('returns object for valid object', () => {
      const obj = { key: 'value' };
      expect(normalizeProps(obj)).toBe(obj);
    });

    test('returns empty object for null', () => {
      expect(normalizeProps(null)).toEqual({});
    });

    test('returns empty object for undefined', () => {
      expect(normalizeProps(undefined)).toEqual({});
    });

    test('returns null for array', () => {
      expect(normalizeProps([1, 2, 3])).toBeNull();
    });

    test('returns null for non-object types', () => {
      expect(normalizeProps('string')).toBeNull();
      expect(normalizeProps(123)).toBeNull();
      expect(normalizeProps(true)).toBeNull();
    });
  });

  describe('normalizeType', () => {
    test('trims strings', () => {
      expect(normalizeType('  TestType  ')).toBe('TestType');
    });

    test('handles empty string', () => {
      expect(normalizeType('')).toBe('');
    });

    test('handles whitespace-only string', () => {
      expect(normalizeType('   ')).toBe('');
    });

    test('handles null/undefined', () => {
      expect(normalizeType(null)).toBe('');
      expect(normalizeType(undefined)).toBe('');
    });

    test('handles numbers', () => {
      expect(normalizeType(123)).toBe('123');
    });

    test('preserves case', () => {
      expect(normalizeType('TestType')).toBe('TestType');
    });
  });
});
