jest.mock('../models/Organization', () => ({
  findById: jest.fn(),
}));
jest.mock('../models/OrganizationMember', () => ({
  findOne: jest.fn(),
}));
jest.mock('../utils/orgRoles', () => ({
  getOrgRoleHierarchy: jest.fn(),
  getOrgRoleLevel: jest.fn(),
}));

const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const orgRoles = require('../utils/orgRoles');
const { loadOrgContext, requireOrgMember, requireOrgRoleAtLeast, requireOrgRole } = require('./org');

function mockReqRes(next) {
  const req = { params: {}, user: null };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const nxt = next || jest.fn();
  return { req, res, next: nxt };
}

describe('org middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadOrgContext', () => {
    test('returns 400 when orgId is missing', async () => {
      const { req, res, next } = mockReqRes();
      await loadOrgContext(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Organization ID required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 404 when organization not found', async () => {
      Organization.findById.mockResolvedValue(null);
      const { req, res, next } = mockReqRes();
      req.params.orgId = 'nonexistent';
      await loadOrgContext(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Organization not found' });
    });

    test('returns 403 when organization is disabled', async () => {
      Organization.findById.mockResolvedValue({ _id: 'org1', status: 'disabled' });
      const { req, res, next } = mockReqRes();
      req.params.orgId = 'org1';
      await loadOrgContext(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Organization is disabled' });
    });

    test('loads org and membership for authenticated user', async () => {
      const org = { _id: 'org1', name: 'Test Org', status: 'active' };
      const membership = { _id: 'mem1', role: 'member' };
      Organization.findById.mockResolvedValue(org);
      OrganizationMember.findOne.mockResolvedValue(membership);
      const { req, res, next } = mockReqRes();
      req.params.orgId = 'org1';
      req.user = { _id: 'user1' };
      await loadOrgContext(req, res, next);
      expect(req.org).toEqual(org);
      expect(req.orgMember).toEqual(membership);
      expect(next).toHaveBeenCalled();
    });

    test('skips membership lookup when user is not authenticated', async () => {
      Organization.findById.mockResolvedValue({ _id: 'org1', status: 'active' });
      const { req, res, next } = mockReqRes();
      req.params.orgId = 'org1';
      req.user = null;
      await loadOrgContext(req, res, next);
      expect(req.org).toBeDefined();
      expect(req.orgMember).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    test('handles findById error in catch block', async () => {
      Organization.findById.mockRejectedValue(new Error('DB error'));
      const { req, res, next } = mockReqRes();
      req.params.orgId = 'org1';
      await loadOrgContext(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to load organization' });
    });
  });

  describe('requireOrgMember', () => {
    test('returns 403 when no org member', () => {
      const { req, res, next } = mockReqRes();
      req.orgMember = null;
      requireOrgMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'You are not a member of this organization' });
      expect(next).not.toHaveBeenCalled();
    });

    test('calls next when org member exists', () => {
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'member' };
      requireOrgMember(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireOrgRoleAtLeast', () => {
    test('returns 403 when no org member', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2 });
      const { req, res, next } = mockReqRes();
      req.orgMember = null;
      await requireOrgRoleAtLeast('admin')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 500 when minRole is unknown', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2 });
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'member' };
      await requireOrgRoleAtLeast('superadmin')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Server misconfiguration: unknown role superadmin' });
    });

    test('returns 403 when user role is below required', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2, viewer: 1 });
      orgRoles.getOrgRoleLevel.mockImplementation(async (role) => {
        const levels = { admin: 3, member: 2, viewer: 1 };
        return levels[role] || 0;
      });
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'viewer' };
      await requireOrgRoleAtLeast('admin')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Requires admin role or higher' });
    });

    test('calls next when user has sufficient role level', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2, viewer: 1 });
      orgRoles.getOrgRoleLevel.mockImplementation(async (role) => {
        const levels = { admin: 3, member: 2, viewer: 1 };
        return levels[role] || 0;
      });
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'admin' };
      await requireOrgRoleAtLeast('member')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('handles getOrgRoleHierarchy error in catch block', async () => {
      orgRoles.getOrgRoleHierarchy.mockRejectedValue(new Error('hierarchy error'));
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'member' };
      await requireOrgRoleAtLeast('admin')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to evaluate organization role' });
    });
  });

  describe('requireOrgRole', () => {
    test('returns 403 when no org member', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2 });
      const { req, res, next } = mockReqRes();
      req.orgMember = null;
      await requireOrgRole('admin')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 500 when roles contain unknown entries', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2 });
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'member' };
      await requireOrgRole(['admin', 'nonexistent'])(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Server misconfiguration: unknown roles nonexistent' });
    });

    test('calls next when user has one of the allowed roles', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2, viewer: 1 });
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'member' };
      await requireOrgRole(['admin', 'member'])(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('returns 403 when user role is not in allowed list', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2, viewer: 1 });
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'viewer' };
      await requireOrgRole(['admin', 'member'])(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Requires one of: admin, member' });
    });

    test('accepts single string role', async () => {
      orgRoles.getOrgRoleHierarchy.mockResolvedValue({ admin: 3, member: 2 });
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'admin' };
      await requireOrgRole('admin')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('handles getOrgRoleHierarchy error in catch block', async () => {
      orgRoles.getOrgRoleHierarchy.mockRejectedValue(new Error('hierarchy error'));
      const { req, res, next } = mockReqRes();
      req.orgMember = { _id: 'mem1', role: 'member' };
      await requireOrgRole('admin')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to evaluate organization role' });
    });
  });
});
