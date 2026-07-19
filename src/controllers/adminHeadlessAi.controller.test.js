const {
  toSafeJsonError,
  handleServiceError,
  validateDefinitionShape,
  extractJsonBlock,
} = require('./adminHeadlessAi.controller')._testHelpers;

describe('adminHeadlessAi.controller helpers', () => {
  describe('toSafeJsonError', () => {
    test('maps VALIDATION to 400', () => {
      const result = toSafeJsonError({ code: 'VALIDATION', message: 'bad input' });
      expect(result).toEqual({ status: 400, body: { error: 'bad input' } });
    });

    test('maps NOT_FOUND to 404', () => {
      const result = toSafeJsonError({ code: 'NOT_FOUND', message: 'missing' });
      expect(result).toEqual({ status: 404, body: { error: 'missing' } });
    });

    test('maps CONFLICT to 409', () => {
      const result = toSafeJsonError({ code: 'CONFLICT', message: 'exists' });
      expect(result).toEqual({ status: 409, body: { error: 'exists' } });
    });

    test('maps unknown codes to 500', () => {
      const result = toSafeJsonError({ code: 'OTHER', message: 'boom' });
      expect(result).toEqual({ status: 500, body: { error: 'boom' } });
    });

    test('uses fallback message when missing', () => {
      const result = toSafeJsonError({ code: 'NOT_FOUND' });
      expect(result).toEqual({ status: 404, body: { error: 'Operation failed' } });
    });

    test('uses fallback for null/undefined', () => {
      expect(toSafeJsonError(null)).toEqual({ status: 500, body: { error: 'Operation failed' } });
      expect(toSafeJsonError(undefined)).toEqual({ status: 500, body: { error: 'Operation failed' } });
    });
  });

  describe('handleServiceError', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
    });

    test('returns 400 for VALIDATION', () => {
      handleServiceError(mockRes, { code: 'VALIDATION', message: 'bad' });
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'bad' });
    });

    test('returns 404 for NOT_FOUND', () => {
      handleServiceError(mockRes, { code: 'NOT_FOUND', message: 'missing' });
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'missing' });
    });

    test('returns 409 for CONFLICT', () => {
      handleServiceError(mockRes, { code: 'CONFLICT', message: 'exists' });
      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'exists' });
    });

    test('returns 500 for unknown codes', () => {
      handleServiceError(mockRes, { code: 'OTHER', message: 'boom' });
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'boom' });
    });

    test('uses fallback message when missing', () => {
      handleServiceError(mockRes, { code: 'NOT_FOUND' });
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });
  });

  describe('validateDefinitionShape', () => {
    test('rejects non-object definitions', () => {
      expect(validateDefinitionShape(null)).toEqual({
        valid: false,
        errors: ['definition must be an object'],
      });
      expect(validateDefinitionShape('string')).toEqual({
        valid: false,
        errors: ['definition must be an object'],
      });
    });

    test('requires codeIdentifier', () => {
      const result = validateDefinitionShape({ fields: [{ key: 'title', type: 'string' }] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('codeIdentifier is required');
    });

    test('requires fields to be an array', () => {
      const result = validateDefinitionShape({ codeIdentifier: 'post', fields: 'not-array' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('fields must be an array');
    });

    test('requires at least one field', () => {
      const result = validateDefinitionShape({ codeIdentifier: 'post', fields: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one field is required');
    });

    test('requires each field to have a key', () => {
      const result = validateDefinitionShape({
        codeIdentifier: 'post',
        fields: [{ type: 'string' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Each field must have a key');
    });

    test('requires each field to have a type', () => {
      const result = validateDefinitionShape({
        codeIdentifier: 'post',
        fields: [{ key: 'title' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "title" must have a type');
    });

    test('validates ref model codes when provided', () => {
      const result = validateDefinitionShape(
        {
          codeIdentifier: 'post',
          fields: [{ key: 'author', type: 'ref', refModelCode: 'user' }],
        },
        { allowedRefModelCodes: new Set(['other']) },
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('refModelCode "user" not found in existing models');
    });

    test('accepts valid definitions', () => {
      const result = validateDefinitionShape({
        codeIdentifier: 'post',
        fields: [{ key: 'title', type: 'string' }],
      });
      expect(result).toEqual({ valid: true, errors: [] });
    });

    test('accepts ref fields with allowed model codes', () => {
      const result = validateDefinitionShape(
        {
          codeIdentifier: 'post',
          fields: [{ key: 'author', type: 'ref', refModelCode: 'user' }],
        },
        { allowedRefModelCodes: new Set(['user']) },
      );
      expect(result).toEqual({ valid: true, errors: [] });
    });
  });

  describe('extractJsonBlock', () => {
    test('extracts JSON from markdown code block', () => {
      const result = extractJsonBlock('```json\n{"a":1}\n```');
      expect(result).toEqual({ a: 1 });
    });

    test('extracts JSON from raw braces', () => {
      const result = extractJsonBlock('some text {"a":1} more text');
      expect(result).toEqual({ a: 1 });
    });

    test('returns null for invalid JSON in code block', () => {
      const result = extractJsonBlock('```json\n{not json}\n```');
      expect(result).toBeNull();
    });

    test('returns null for invalid JSON in braces', () => {
      const result = extractJsonBlock('{not json}');
      expect(result).toBeNull();
    });

    test('returns null when no JSON is present', () => {
      expect(extractJsonBlock('no json here')).toBeNull();
      expect(extractJsonBlock('')).toBeNull();
    });
  });
});
