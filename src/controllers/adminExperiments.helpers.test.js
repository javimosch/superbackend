const {
  toSafeJsonError,
  isValidObjectId,
  normalizeVariant,
  normalizeMetric,
} = require('./adminExperiments.controller')._testHelpers;

describe('adminExperiments.controller helpers', () => {
  describe('toSafeJsonError', () => {
    test('maps VALIDATION to 400', () => {
      expect(toSafeJsonError({ code: 'VALIDATION', message: 'Invalid' })).toEqual({
        status: 400,
        body: { error: 'Invalid' },
      });
    });

    test('maps NOT_FOUND to 404', () => {
      expect(toSafeJsonError({ code: 'NOT_FOUND', message: 'Missing' })).toEqual({
        status: 404,
        body: { error: 'Missing' },
      });
    });

    test('maps CONFLICT to 409', () => {
      expect(toSafeJsonError({ code: 'CONFLICT', message: 'Conflict' })).toEqual({
        status: 409,
        body: { error: 'Conflict' },
      });
    });

    test('maps unknown errors to 500 with default message', () => {
      expect(toSafeJsonError({})).toEqual({
        status: 500,
        body: { error: 'Operation failed' },
      });
    });
  });

  describe('isValidObjectId', () => {
    test('returns true for a valid ObjectId string', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
    });

    test('returns false for invalid strings', () => {
      expect(isValidObjectId('not-an-object-id')).toBe(false);
    });

    test('returns false for null, undefined and empty values', () => {
      expect(isValidObjectId(null)).toBe(false);
      expect(isValidObjectId(undefined)).toBe(false);
      expect(isValidObjectId('')).toBe(false);
    });
  });

  describe('normalizeVariant', () => {
    test('returns a normalized variant object', () => {
      expect(normalizeVariant({ key: 'control', weight: 50, configSlug: 'base' })).toEqual({
        key: 'control',
        weight: 50,
        configSlug: 'base',
      });
    });

    test('trims keys and slugs', () => {
      expect(normalizeVariant({ key: '  variant  ', configSlug: '  slug  ' })).toEqual({
        key: 'variant',
        weight: 0,
        configSlug: 'slug',
      });
    });

    test('defaults weight to 0', () => {
      expect(normalizeVariant({ key: 'a' })).toEqual({ key: 'a', weight: 0, configSlug: '' });
    });

    test('coerces weight to a number', () => {
      expect(normalizeVariant({ key: 'a', weight: '10' })).toEqual({ key: 'a', weight: 10, configSlug: '' });
      expect(normalizeVariant({ key: 'a', weight: 'bad' })).toEqual({ key: 'a', weight: 0, configSlug: '' });
    });

    test('returns null when key is missing', () => {
      expect(normalizeVariant({ weight: 10 })).toBeNull();
      expect(normalizeVariant({})).toBeNull();
    });
  });

  describe('normalizeMetric', () => {
    test('returns a normalized metric with defaults', () => {
      expect(normalizeMetric({ key: 'signups' })).toEqual({
        key: 'signups',
        kind: 'count',
        numeratorEventKey: '',
        denominatorEventKey: '',
        objective: 'maximize',
      });
    });

    test('trims the key and kind', () => {
      expect(normalizeMetric({ key: '  signups  ', kind: '  rate  ' })).toEqual({
        key: 'signups',
        kind: 'rate',
        numeratorEventKey: '',
        denominatorEventKey: '',
        objective: 'maximize',
      });
    });

    test('normalizes objective to minimize when requested', () => {
      expect(normalizeMetric({ key: 'errors', objective: 'minimize' }).objective).toBe('minimize');
    });

    test('falls back to maximize for unknown objectives', () => {
      expect(normalizeMetric({ key: 'errors', objective: 'unknown' }).objective).toBe('maximize');
    });

    test('returns null when key is missing', () => {
      expect(normalizeMetric({ kind: 'count' })).toBeNull();
      expect(normalizeMetric({})).toBeNull();
    });
  });
});
