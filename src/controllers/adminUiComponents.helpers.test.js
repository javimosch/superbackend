const { randomLowerAlphaNum, generateProjectId, parseBool } = require('./adminUiComponents.controller')._testHelpers;

describe('adminUiComponents.controller helpers', () => {
  describe('randomLowerAlphaNum', () => {
    test('returns a string of the requested length', () => {
      expect(randomLowerAlphaNum(8)).toHaveLength(8);
      expect(randomLowerAlphaNum(16)).toHaveLength(16);
      expect(randomLowerAlphaNum(0)).toHaveLength(0);
    });

    test('returns only lowercase alphanumeric characters', () => {
      const result = randomLowerAlphaNum(100);
      expect(result).toMatch(/^[a-z0-9]+$/);
    });

    test('returns different values across calls', () => {
      const a = randomLowerAlphaNum(16);
      const b = randomLowerAlphaNum(16);
      expect(a).not.toBe(b);
    });
  });

  describe('generateProjectId', () => {
    test('returns a project id with the prj_ prefix', () => {
      const id = generateProjectId();
      expect(id.startsWith('prj_')).toBe(true);
    });

    test('returns a project id of expected length', () => {
      const id = generateProjectId();
      expect(id).toHaveLength(20);
    });

    test('returns only lowercase alphanumeric characters after the prefix', () => {
      const id = generateProjectId();
      const suffix = id.slice(4);
      expect(suffix).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('parseBool', () => {
    test('returns boolean values unchanged', () => {
      expect(parseBool(true, false)).toBe(true);
      expect(parseBool(false, true)).toBe(false);
    });

    test('parses truthy strings', () => {
      expect(parseBool('true', false)).toBe(true);
      expect(parseBool('1', false)).toBe(true);
      expect(parseBool('yes', false)).toBe(true);
      expect(parseBool('TRUE', false)).toBe(true);
      expect(parseBool(' Yes ', false)).toBe(true);
    });

    test('parses falsy strings', () => {
      expect(parseBool('false', true)).toBe(false);
      expect(parseBool('0', true)).toBe(false);
      expect(parseBool('no', true)).toBe(false);
      expect(parseBool('FALSE', true)).toBe(false);
      expect(parseBool(' No ', true)).toBe(false);
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
});
