jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, createHash: jest.fn((algorithm) => actual.createHash(algorithm)) };
});
jest.mock('mongoose', () => ({}));
jest.mock('./cacheLayer.service', () => ({}));
jest.mock('./globalSettings.service', () => ({}));

const {
  parseDurationToMs,
  interpolateCtx,
} = require('./pagesContext.service');

describe('pagesContext.service', () => {
  describe('parseDurationToMs', () => {
    test('returns null for null/undefined', () => {
      expect(parseDurationToMs(null)).toBeNull();
      expect(parseDurationToMs(undefined)).toBeNull();
    });

    test('returns number as-is if finite', () => {
      expect(parseDurationToMs(5000)).toBe(5000);
    });

    test('returns null for empty string', () => {
      expect(parseDurationToMs('')).toBeNull();
      expect(parseDurationToMs('  ')).toBeNull();
    });

    test('parses milliseconds', () => {
      expect(parseDurationToMs('500ms')).toBe(500);
    });

    test('parses seconds', () => {
      expect(parseDurationToMs('30s')).toBe(30000);
    });

    test('parses minutes', () => {
      expect(parseDurationToMs('5m')).toBe(300000);
    });

    test('parses decimal values', () => {
      expect(parseDurationToMs('1.5s')).toBe(1500);
    });

    test('returns null for unknown unit', () => {
      expect(parseDurationToMs('10h')).toBeNull();
      expect(parseDurationToMs('10x')).toBeNull();
    });

    test('returns null for malformed input', () => {
      expect(parseDurationToMs('abc')).toBeNull();
    });

    test('is case insensitive', () => {
      expect(parseDurationToMs('30S')).toBe(30000);
      expect(parseDurationToMs('5M')).toBe(300000);
      expect(parseDurationToMs('500MS')).toBe(500);
    });
  });

  describe('interpolateCtx', () => {
    const ctx = { user: { name: 'Alice' }, role: 'admin' };

    test('returns null/undefined as-is', () => {
      expect(interpolateCtx(null, ctx)).toBeNull();
      expect(interpolateCtx(undefined, ctx)).toBeUndefined();
    });

    test('returns primitive values as-is', () => {
      expect(interpolateCtx('hello', ctx)).toBe('hello');
      expect(interpolateCtx(42, ctx)).toBe(42);
      expect(interpolateCtx(true, ctx)).toBe(true);
    });

    test('resolves $ctx references from context', () => {
      expect(interpolateCtx({ $ctx: 'user.name' }, ctx)).toBe('Alice');
      expect(interpolateCtx({ $ctx: 'role' }, ctx)).toBe('admin');
    });

    test('returns undefined for unresolvable $ctx reference', () => {
      expect(interpolateCtx({ $ctx: 'missing.key' }, ctx)).toBeUndefined();
    });

    test('recursively interpolates objects', () => {
      const input = { title: 'Hello', author: { $ctx: 'user.name' } };
      expect(interpolateCtx(input, ctx)).toEqual({ title: 'Hello', author: 'Alice' });
    });

    test('recursively interpolates arrays', () => {
      const input = [{ $ctx: 'user.name' }, { $ctx: 'role' }];
      expect(interpolateCtx(input, ctx)).toEqual(['Alice', 'admin']);
    });

    test('does not mutate original objects', () => {
      const input = { $ctx: 'user.name' };
      const result = interpolateCtx(input, ctx);
      expect(result).toBe('Alice');
      expect(input).toEqual({ $ctx: 'user.name' });
    });
  });
});
