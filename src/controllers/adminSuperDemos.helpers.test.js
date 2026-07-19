const { randomLowerAlphaNum, normalizeStylePreset, normalizeStyleOverrides, generateProjectId, generateDemoId, parseBool, addQueryParam } = require('./adminSuperDemos.controller')._testHelpers;

describe('adminSuperDemos.controller helpers', () => {
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

  describe('normalizeStylePreset', () => {
    test('returns allowed presets unchanged', () => {
      expect(normalizeStylePreset('default')).toBe('default');
      expect(normalizeStylePreset('glass-dark')).toBe('glass-dark');
      expect(normalizeStylePreset('high-contrast')).toBe('high-contrast');
      expect(normalizeStylePreset('soft-purple')).toBe('soft-purple');
    });

    test('is case-insensitive', () => {
      expect(normalizeStylePreset('GLASS-DARK')).toBe('glass-dark');
      expect(normalizeStylePreset('Soft-Purple')).toBe('soft-purple');
    });

    test('returns default for unknown values', () => {
      expect(normalizeStylePreset('fancy')).toBe('default');
      expect(normalizeStylePreset('')).toBe('default');
      expect(normalizeStylePreset(null)).toBe('default');
      expect(normalizeStylePreset(undefined)).toBe('default');
    });
  });

  describe('normalizeStyleOverrides', () => {
    test('returns raw value when within limit', () => {
      const value = 'a'.repeat(100);
      expect(normalizeStyleOverrides(value)).toBe(value);
    });

    test('truncates values exceeding the limit', () => {
      const value = 'a'.repeat(20001);
      expect(normalizeStyleOverrides(value)).toHaveLength(20000);
    });

    test('coerces non-strings to string', () => {
      expect(normalizeStyleOverrides(123)).toBe('123');
    });
  });

  describe('generateProjectId', () => {
    test('returns a project id with the sdp_ prefix', () => {
      const id = generateProjectId();
      expect(id.startsWith('sdp_')).toBe(true);
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

  describe('generateDemoId', () => {
    test('returns a demo id with the demo_ prefix', () => {
      const id = generateDemoId();
      expect(id.startsWith('demo_')).toBe(true);
    });

    test('returns a demo id of expected length', () => {
      const id = generateDemoId();
      expect(id).toHaveLength(21);
    });

    test('returns only lowercase alphanumeric characters after the prefix', () => {
      const id = generateDemoId();
      const suffix = id.slice(5);
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

  describe('addQueryParam', () => {
    test('appends a query parameter to a URL', () => {
      const result = addQueryParam('https://example.com/path', 'foo', 'bar');
      expect(result).toBe('https://example.com/path?foo=bar');
    });

    test('overwrites an existing query parameter', () => {
      const result = addQueryParam('https://example.com/path?foo=old', 'foo', 'new');
      expect(result).toBe('https://example.com/path?foo=new');
    });

    test('encodes special characters', () => {
      const result = addQueryParam('https://example.com/path', 'q', 'hello world');
      expect(result).toBe('https://example.com/path?q=hello+world');
    });

    test('throws for invalid URLs', () => {
      expect(() => addQueryParam('not-a-url', 'foo', 'bar')).toThrow();
    });
  });
});
