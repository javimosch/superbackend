const {
  toSafeJsonError,
  handleServiceError,
  validateDefinitionShape,
  extractJsonBlock,
} = require('./adminHeadlessAi.controller')._testHelpers;

function mockRes() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { status, json };
}

describe('adminHeadlessAi.controller helpers', () => {
  describe('toSafeJsonError', () => {
    test('maps VALIDATION to 400', () => {
      const result = toSafeJsonError({ code: 'VALIDATION', message: 'Invalid' });
      expect(result).toEqual({ status: 400, body: { error: 'Invalid' } });
    });

    test('maps NOT_FOUND to 404', () => {
      const result = toSafeJsonError({ code: 'NOT_FOUND', message: 'Missing' });
      expect(result).toEqual({ status: 404, body: { error: 'Missing' } });
    });

    test('maps CONFLICT to 409', () => {
      const result = toSafeJsonError({ code: 'CONFLICT', message: 'Conflict' });
      expect(result).toEqual({ status: 409, body: { error: 'Conflict' } });
    });

    test('maps unknown errors to 500', () => {
      const result = toSafeJsonError(new Error('Boom'));
      expect(result).toEqual({ status: 500, body: { error: 'Boom' } });
    });

    test('uses default message when none provided', () => {
      const result = toSafeJsonError({});
      expect(result).toEqual({ status: 500, body: { error: 'Operation failed' } });
    });
  });

  describe('handleServiceError', () => {
    test('returns 400 for VALIDATION', () => {
      const res = mockRes();
      handleServiceError(res, { code: 'VALIDATION', message: 'Invalid' });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid' });
    });

    test('returns 404 for NOT_FOUND', () => {
      const res = mockRes();
      handleServiceError(res, { code: 'NOT_FOUND', message: 'Missing' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing' });
    });

    test('returns 409 for CONFLICT', () => {
      const res = mockRes();
      handleServiceError(res, { code: 'CONFLICT', message: 'Conflict' });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Conflict' });
    });

    test('returns 500 by default', () => {
      const res = mockRes();
      handleServiceError(res, {});
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });
  });

  describe('validateDefinitionShape', () => {
    test('rejects non-object definitions', () => {
      const result = validateDefinitionShape('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('definition must be an object');
    });

    test('requires codeIdentifier', () => {
      const result = validateDefinitionShape({ fields: [{ key: 'a', type: 'string' }] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('codeIdentifier is required');
    });

    test('requires fields to be an array', () => {
      const result = validateDefinitionShape({ codeIdentifier: 'test', fields: 'bad' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('fields must be an array');
    });

    test('requires at least one field', () => {
      const result = validateDefinitionShape({ codeIdentifier: 'test', fields: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one field is required');
    });

    test('requires each field to have a key', () => {
      const result = validateDefinitionShape({ codeIdentifier: 'test', fields: [{ type: 'string' }] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Each field must have a key');
    });

    test('requires each field to have a type', () => {
      const result = validateDefinitionShape({ codeIdentifier: 'test', fields: [{ key: 'a' }] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "a" must have a type');
    });

    test('validates ref model codes', () => {
      const result = validateDefinitionShape(
        { codeIdentifier: 'test', fields: [{ key: 'a', type: 'ref', refModelCode: 'user' }] },
        { allowedRefModelCodes: new Set(['other']) },
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('refModelCode "user" not found in existing models');
    });

    test('accepts a valid definition', () => {
      const result = validateDefinitionShape(
        { codeIdentifier: 'test', fields: [{ key: 'a', type: 'string' }] },
        { allowedRefModelCodes: new Set() },
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('accepts ref fields with allowed model codes', () => {
      const result = validateDefinitionShape(
        { codeIdentifier: 'test', fields: [{ key: 'a', type: 'ref', refModelCode: 'user' }] },
        { allowedRefModelCodes: new Set(['user']) },
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('extractJsonBlock', () => {
    test('parses JSON inside markdown block', () => {
      const result = extractJsonBlock('```json\n{"a":1}\n```');
      expect(result).toEqual({ a: 1 });
    });

    test('returns null for unparseable markdown block', () => {
      const result = extractJsonBlock('```json\nnot json\n```');
      expect(result).toBeNull();
    });

    test('parses bare JSON object', () => {
      const result = extractJsonBlock('prefix {"key":"value"} suffix');
      expect(result).toEqual({ key: 'value' });
    });

    test('returns null when no JSON is found', () => {
      const result = extractJsonBlock('just plain text');
      expect(result).toBeNull();
    });
  });
});
