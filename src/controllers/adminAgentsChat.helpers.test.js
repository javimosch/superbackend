const { safeParse } = require('./adminAgentsChat.controller')._testHelpers;

describe('adminAgentsChat.controller helpers', () => {
  describe('safeParse', () => {
    test('parses valid JSON strings', () => {
      expect(safeParse('{"key":"value"}')).toEqual({ key: 'value' });
      expect(safeParse('{"number":123}')).toEqual({ number: 123 });
      expect(safeParse('{"nested":{"deep":"value"}}')).toEqual({ nested: { deep: 'value' } });
      expect(safeParse('["array","of","items"]')).toEqual(['array', 'of', 'items']);
      expect(safeParse('true')).toBe(true);
      expect(safeParse('false')).toBe(false);
      expect(safeParse('null')).toBe(null);
      expect(safeParse('123')).toBe(123);
      expect(safeParse('"string"')).toBe('string');
    });

    test('returns fallback for invalid JSON strings', () => {
      expect(safeParse('invalid json')).toBe(null);
      expect(safeParse('{invalid}')).toBe(null);
      expect(safeParse('{"unclosed":')).toBe(null);
      expect(safeParse('')).toBe(null);
      expect(safeParse('undefined')).toBe(null);
    });

    test('returns custom fallback when provided', () => {
      expect(safeParse('invalid json', 'default')).toBe('default');
      expect(safeParse('invalid json', { fallback: true })).toEqual({ fallback: true });
      expect(safeParse('invalid json', [])).toEqual([]);
      expect(safeParse('invalid json', 0)).toBe(0);
    });

    test('returns fallback for non-string inputs', () => {
      expect(safeParse(undefined)).toBe(null);
      expect(safeParse({})).toBe(null);
      expect(safeParse([])).toBe(null);
    });

    test('handles JSON.parse-compatible non-string inputs', () => {
      expect(safeParse(null)).toBe(null);
      expect(safeParse(123)).toBe(123);
      expect(safeParse(true)).toBe(true);
      expect(safeParse(false)).toBe(false);
    });

    test('returns custom fallback for truly invalid inputs', () => {
      expect(safeParse(undefined, 'default')).toBe('default');
      expect(safeParse({}, { fallback: true })).toEqual({ fallback: true });
      expect(safeParse([], [])).toEqual([]);
    });
  });
});
