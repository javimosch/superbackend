const { isBasicAuthSuperAdmin } = require('./rbac');

describe('rbac middleware', () => {
  beforeEach(() => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isBasicAuthSuperAdmin', () => {
    test('returns true for valid admin credentials', () => {
      const credentials = Buffer.from('admin:secret').toString('base64');
      const req = { headers: { authorization: `Basic ${credentials}` } };
      expect(isBasicAuthSuperAdmin(req)).toBe(true);
    });

    test('returns false when no auth header', () => {
      const req = { headers: {} };
      expect(isBasicAuthSuperAdmin(req)).toBe(false);
    });

    test('returns false for non-Basic auth', () => {
      const req = { headers: { authorization: 'Bearer token' } };
      expect(isBasicAuthSuperAdmin(req)).toBe(false);
    });

    test('returns false for wrong credentials', () => {
      const credentials = Buffer.from('admin:wrongpassword').toString('base64');
      const req = { headers: { authorization: `Basic ${credentials}` } };
      expect(isBasicAuthSuperAdmin(req)).toBe(false);
    });

    test('handles password containing colon', () => {
      process.env.ADMIN_PASSWORD = 'pass:word:with:colons';
      const credentials = Buffer.from('admin:pass:word:with:colons').toString('base64');
      const req = { headers: { authorization: `Basic ${credentials}` } };
      expect(isBasicAuthSuperAdmin(req)).toBe(true);
    });

    test('returns false for malformed base64', () => {
      const req = { headers: { authorization: 'Basic !!!invalid-base64!!!' } };
      expect(isBasicAuthSuperAdmin(req)).toBe(false);
    });

    test('uses fallback defaults when env vars not set', () => {
      delete process.env.ADMIN_USERNAME;
      delete process.env.ADMIN_PASSWORD;
      const credentials = Buffer.from('admin:admin').toString('base64');
      const req = { headers: { authorization: `Basic ${credentials}` } };
      expect(isBasicAuthSuperAdmin(req)).toBe(true);
    });

    test('returns false for empty password', () => {
      process.env.ADMIN_PASSWORD = '';
      const credentials = Buffer.from('admin:secret').toString('base64');
      const req = { headers: { authorization: `Basic ${credentials}` } };
      expect(isBasicAuthSuperAdmin(req)).toBe(false);
    });
  });
});
