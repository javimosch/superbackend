const { parseLimit, parseOffset, escapeRegex, buildInviteLink } = require('./orgAdminMembers.controller')._testHelpers;

describe('orgAdminMembers.controller helpers', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('parseLimit', () => {
    test('returns default (50) for NaN', () => {
      expect(parseLimit(NaN)).toBe(50);
      expect(parseLimit('invalid')).toBe(50);
      expect(parseLimit(undefined)).toBe(50);
      expect(parseLimit(null)).toBe(50);
    });

    test('clamps max (>500) to 500', () => {
      expect(parseLimit(501)).toBe(500);
      expect(parseLimit(1000)).toBe(500);
      expect(parseLimit('999')).toBe(500);
    });

    test('clamps min (<1) to 1', () => {
      expect(parseLimit(0)).toBe(1);
      expect(parseLimit(-5)).toBe(1);
      expect(parseLimit('-10')).toBe(1);
    });

    test('returns valid number unchanged', () => {
      expect(parseLimit(1)).toBe(1);
      expect(parseLimit(50)).toBe(50);
      expect(parseLimit(100)).toBe(100);
      expect(parseLimit(500)).toBe(500);
      expect(parseLimit('25')).toBe(25);
    });
  });

  describe('parseOffset', () => {
    test('returns 0 for NaN', () => {
      expect(parseOffset(NaN)).toBe(0);
      expect(parseOffset('invalid')).toBe(0);
      expect(parseOffset(undefined)).toBe(0);
      expect(parseOffset(null)).toBe(0);
    });

    test('returns 0 for negative values', () => {
      expect(parseOffset(-1)).toBe(0);
      expect(parseOffset(-100)).toBe(0);
      expect(parseOffset('-50')).toBe(0);
    });

    test('returns valid number unchanged', () => {
      expect(parseOffset(0)).toBe(0);
      expect(parseOffset(10)).toBe(10);
      expect(parseOffset(100)).toBe(100);
      expect(parseOffset('25')).toBe(25);
    });
  });

  describe('escapeRegex', () => {
    test('escapes special regex characters', () => {
      expect(escapeRegex('test.value')).toBe('test\\.value');
      expect(escapeRegex('test*value')).toBe('test\\*value');
      expect(escapeRegex('test+value')).toBe('test\\+value');
      expect(escapeRegex('test?value')).toBe('test\\?value');
      expect(escapeRegex('test^value')).toBe('test\\^value');
      expect(escapeRegex('test$value')).toBe('test\\$value');
      expect(escapeRegex('test{value}')).toBe('test\\{value\\}');
      expect(escapeRegex('test(value)')).toBe('test\\(value\\)');
      expect(escapeRegex('test|value')).toBe('test\\|value');
      expect(escapeRegex('test[value]')).toBe('test\\[value\\]');
      expect(escapeRegex('test\\value')).toBe('test\\\\value');
    });

    test('handles multiple special characters', () => {
      expect(escapeRegex('test.*+?^${}()|[]\\value')).toBe('test\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\value');
    });

    test('leaves normal strings unchanged', () => {
      expect(escapeRegex('normalstring')).toBe('normalstring');
      expect(escapeRegex('test123')).toBe('test123');
      expect(escapeRegex('email@example.com')).toBe('email@example\\.com');
    });
  });

  describe('buildInviteLink', () => {
    test('uses PUBLIC_URL env var when set', () => {
      process.env.PUBLIC_URL = 'https://example.com';
      expect(buildInviteLink('abc123')).toBe('https://example.com/accept-invite?token=abc123');
    });

    test('falls back to localhost when PUBLIC_URL not set', () => {
      delete process.env.PUBLIC_URL;
      expect(buildInviteLink('abc123')).toBe('http://localhost:3000/accept-invite?token=abc123');
    });

    test('encodes token properly', () => {
      process.env.PUBLIC_URL = 'https://example.com';
      expect(buildInviteLink('token with spaces')).toBe('https://example.com/accept-invite?token=token%20with%20spaces');
      expect(buildInviteLink('token?query=value')).toBe('https://example.com/accept-invite?token=token%3Fquery%3Dvalue');
    });
  });
});
