const { requireRight, requireModuleAccess, isBasicAuthSuperAdmin } = require('./rbac');
const rbacService = require('../services/rbac.service');

jest.mock('../services/rbac.service', () => ({
  checkRight: jest.fn(),
}));

describe('RBAC Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      headers: {},
      user: null,
      params: {},
      query: {},
      body: {},
      session: {},
      path: '/some/path',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn(),
      render: jest.fn(),
      send: jest.fn(),
    };

    mockNext = jest.fn();

    process.env.ADMIN_USERNAME = 'testadmin';
    process.env.ADMIN_PASSWORD = 'testpass';
  });

  // ---------------------------------------------------------------------------
  // isBasicAuthSuperAdmin
  // ---------------------------------------------------------------------------
  describe('isBasicAuthSuperAdmin', () => {
    test('returns true for valid basic-auth super-admin credentials', () => {
      const creds = Buffer.from('testadmin:testpass').toString('base64');
      mockReq.headers.authorization = `Basic ${creds}`;
      expect(isBasicAuthSuperAdmin(mockReq)).toBe(true);
    });

    test('returns false when no authorization header', () => {
      expect(isBasicAuthSuperAdmin(mockReq)).toBe(false);
    });

    test('returns false for Bearer token (not Basic)', () => {
      mockReq.headers.authorization = 'Bearer sometoken';
      expect(isBasicAuthSuperAdmin(mockReq)).toBe(false);
    });

    test('returns false for wrong credentials', () => {
      const creds = Buffer.from('hacker:wrong').toString('base64');
      mockReq.headers.authorization = `Basic ${creds}`;
      expect(isBasicAuthSuperAdmin(mockReq)).toBe(false);
    });

    test('falls back to "admin"/"admin" when env vars are unset', () => {
      delete process.env.ADMIN_USERNAME;
      delete process.env.ADMIN_PASSWORD;
      const creds = Buffer.from('admin:admin').toString('base64');
      mockReq.headers.authorization = `Basic ${creds}`;
      expect(isBasicAuthSuperAdmin(mockReq)).toBe(true);
    });

    test('returns false when headers object is missing', () => {
      mockReq.headers = undefined;
      expect(isBasicAuthSuperAdmin(mockReq)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // requireRight
  // ---------------------------------------------------------------------------
  describe('requireRight', () => {
    test('calls next() when service grants the right', async () => {
      mockReq.user = { _id: 'user1' };
      mockReq.params.orgId = 'org1';
      rbacService.checkRight.mockResolvedValue({ allowed: true });

      const middleware = requireRight('some:right');
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).toHaveBeenCalledWith({
        userId: 'user1',
        orgId: 'org1',
        right: 'some:right',
      });
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('responds 403 when service denies the right', async () => {
      mockReq.user = { _id: 'user1' };
      mockReq.params.orgId = 'org1';
      rbacService.checkRight.mockResolvedValue({ allowed: false, reason: 'missing right' });

      const middleware = requireRight('some:right');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied', reason: 'missing right' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('super-admin basic-auth bypasses service check', async () => {
      const creds = Buffer.from('testadmin:testpass').toString('base64');
      mockReq.headers.authorization = `Basic ${creds}`;

      const middleware = requireRight('some:right');
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    test('responds 401 when req.user is missing', async () => {
      mockReq.params.orgId = 'org1';

      const middleware = requireRight('some:right');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('responds 400 when orgId cannot be resolved', async () => {
      mockReq.user = { _id: 'user1' };

      const middleware = requireRight('some:right');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'orgId is required for RBAC checks' });
    });

    test('resolves orgId from query when params is empty', async () => {
      mockReq.user = { _id: 'user1' };
      mockReq.query.orgId = 'org-query';
      rbacService.checkRight.mockResolvedValue({ allowed: true });

      const middleware = requireRight('some:right');
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-query' })
      );
    });

    test('resolves orgId from body when params and query are empty', async () => {
      mockReq.user = { _id: 'user1' };
      mockReq.body.orgId = 'org-body';
      rbacService.checkRight.mockResolvedValue({ allowed: true });

      const middleware = requireRight('some:right');
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-body' })
      );
    });

    test('uses custom getOrgId function from options', async () => {
      mockReq.user = { _id: 'user1' };
      rbacService.checkRight.mockResolvedValue({ allowed: true });

      const middleware = requireRight('some:right', {
        getOrgId: () => 'custom-org',
      });
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'custom-org' })
      );
    });

    test('responds 500 when service throws', async () => {
      mockReq.user = { _id: 'user1' };
      mockReq.params.orgId = 'org1';
      rbacService.checkRight.mockRejectedValue(new Error('DB failure'));

      const middleware = requireRight('some:right');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to evaluate RBAC rights' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // requireModuleAccess
  // ---------------------------------------------------------------------------
  describe('requireModuleAccess', () => {
    beforeEach(() => {
      mockReq.session = { authData: { userId: 'session-user' } };
    });

    test('calls next() when read access is granted', async () => {
      rbacService.checkRight.mockResolvedValue({ allowed: true });

      const middleware = requireModuleAccess('audit', 'read');
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).toHaveBeenCalledWith({
        userId: 'session-user',
        orgId: null,
        right: 'admin_panel__audit:read',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    test('calls next() when write access is granted', async () => {
      rbacService.checkRight.mockResolvedValue({ allowed: true });

      const middleware = requireModuleAccess('users', 'write');
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).toHaveBeenCalledWith({
        userId: 'session-user',
        orgId: null,
        right: 'admin_panel__users:write',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    test('defaults action to "read" when not specified', async () => {
      rbacService.checkRight.mockResolvedValue({ allowed: true });

      const middleware = requireModuleAccess('audit');
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).toHaveBeenCalledWith(
        expect.objectContaining({ right: 'admin_panel__audit:read' })
      );
    });

    test('responds 403 JSON for API route when access denied', async () => {
      mockReq.path = '/api/audit';
      rbacService.checkRight.mockResolvedValue({ allowed: false, reason: 'no access' });

      const middleware = requireModuleAccess('audit', 'read');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Access denied', moduleId: 'audit', action: 'read' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('renders 403 page for non-API route when access denied', async () => {
      mockReq.path = '/admin/audit';
      rbacService.checkRight.mockResolvedValue({ allowed: false, reason: 'no access' });

      const middleware = requireModuleAccess('audit', 'read');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.render).toHaveBeenCalledWith(
        'admin-403',
        expect.objectContaining({ moduleId: 'audit', action: 'read' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('super-admin basic-auth bypasses service check', async () => {
      const creds = Buffer.from('testadmin:testpass').toString('base64');
      mockReq.headers.authorization = `Basic ${creds}`;

      const middleware = requireModuleAccess('audit', 'read');
      await middleware(mockReq, mockRes, mockNext);

      expect(rbacService.checkRight).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    test('redirects to login when no session userId', async () => {
      mockReq.session = {};

      const middleware = requireModuleAccess('audit', 'read');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login');
      expect(rbacService.checkRight).not.toHaveBeenCalled();
    });

    test('uses req.adminPath for redirect when set', async () => {
      mockReq.session = {};
      mockReq.adminPath = '/custom-admin';

      const middleware = requireModuleAccess('audit', 'read');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/custom-admin/login');
    });

    test('responds 500 JSON for API route when service throws', async () => {
      mockReq.path = '/api/audit';
      rbacService.checkRight.mockRejectedValue(new Error('DB failure'));

      const middleware = requireModuleAccess('audit', 'read');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access check failed' });
    });

    test('responds 500 plain text for page route when service throws', async () => {
      mockReq.path = '/admin/audit';
      rbacService.checkRight.mockRejectedValue(new Error('DB failure'));

      const middleware = requireModuleAccess('audit', 'read');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Access check failed');
    });
  });
});
