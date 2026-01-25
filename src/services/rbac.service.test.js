const mongoose = require('mongoose');
const OrganizationMember = require('../models/OrganizationMember');
const RbacUserRole = require('../models/RbacUserRole');
const RbacGroup = require('../models/RbacGroup');
const RbacGroupMember = require('../models/RbacGroupMember');
const RbacGroupRole = require('../models/RbacGroupRole');
const RbacGrant = require('../models/RbacGrant');
const rbacService = require('./rbac.service');

jest.mock('../models/OrganizationMember');
jest.mock('../models/RbacUserRole');
jest.mock('../models/RbacGroup');
jest.mock('../models/RbacGroupMember');
jest.mock('../models/RbacGroupRole');
jest.mock('../models/RbacGrant');

describe('rbac.service', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const mockOrgId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserOrgIds', () => {
    test('returns list of org IDs for user', async () => {
      const mockMemberships = [
        { orgId: new mongoose.Types.ObjectId() },
        { orgId: new mongoose.Types.ObjectId() }
      ];
      OrganizationMember.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockMemberships)
      });

      const result = await rbacService.getUserOrgIds(mockUserId);

      expect(result).toHaveLength(2);
      expect(typeof result[0]).toBe('string');
      expect(OrganizationMember.find).toHaveBeenCalledWith({ userId: mockUserId, status: 'active' });
    });

    test('returns empty array for invalid userId', async () => {
      const result = await rbacService.getUserOrgIds(null);
      expect(result).toEqual([]);
    });
  });

  describe('checkRight', () => {
    test('returns allowed: true when grant exists', async () => {
      OrganizationMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ status: 'active' }) });
      RbacUserRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
      RbacGroupMember.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
      
      // Setup a direct user grant for the right
      RbacGrant.find.mockImplementation((query) => {
        if (query.subjectType === 'user' && query.scopeType === 'global') {
          return { lean: jest.fn().mockResolvedValue([{ _id: 'grant1', effect: 'allow', right: 'users.read', subjectType: 'user', subjectId: mockUserId, scopeType: 'global' }]) };
        }
        return { lean: jest.fn().mockResolvedValue([]) };
      });

      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: 'users.read'
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('allowed');
      expect(result.decisionLayer).toBe('user');
    });

    test('returns allowed: false when deny grant exists', async () => {
      OrganizationMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ status: 'active' }) });
      RbacUserRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
      RbacGroupMember.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
      
      // Setup a deny grant
      RbacGrant.find.mockImplementation((query) => {
        if (query.subjectType === 'user' && query.scopeType === 'global') {
          return { lean: jest.fn().mockResolvedValue([{ _id: 'grant1', effect: 'deny', right: 'users.*', subjectType: 'user', subjectId: mockUserId, scopeType: 'global' }]) };
        }
        return { lean: jest.fn().mockResolvedValue([]) };
      });

      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: 'users.read'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('denied');
    });

    test('returns allowed: false when not an org member', async () => {
      OrganizationMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: 'anything'
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_org_member');
    });

    test('handles group-based grants', async () => {
      OrganizationMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ status: 'active' }) });
      RbacUserRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
      
      const mockGroupId = new mongoose.Types.ObjectId();
      RbacGroupMember.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ groupId: mockGroupId }]) });
      RbacGroup.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ _id: mockGroupId, orgId: mockOrgId, isGlobal: false }]) });
      RbacGroupRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });

      RbacGrant.find.mockImplementation((query) => {
        if (query.subjectType === 'group' && String(query.subjectId?.$in?.[0]) === String(mockGroupId)) {
          return { lean: jest.fn().mockResolvedValue([{ _id: 'grant-group', effect: 'allow', right: 'files.write', subjectType: 'group', subjectId: mockGroupId, scopeType: 'org' }]) };
        }
        return { lean: jest.fn().mockResolvedValue([]) };
      });

      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: 'files.write'
      });

      expect(result.allowed).toBe(true);
      expect(result.decisionLayer).toBe('group');
    });

    test('handles global group grants', async () => {
      OrganizationMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ status: 'active' }) });
      RbacUserRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
      
      const mockGlobalGroupId = new mongoose.Types.ObjectId();
      RbacGroupMember.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ groupId: mockGlobalGroupId }]) });
      RbacGroup.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ _id: mockGlobalGroupId, isGlobal: true }]) });
      RbacGroupRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });

      RbacGrant.find.mockImplementation((query) => {
        if (query.subjectType === 'group' && String(query.subjectId?.$in?.[0]) === String(mockGlobalGroupId)) {
          return { lean: jest.fn().mockResolvedValue([{ _id: 'grant-global-group', effect: 'allow', right: 'global.view', subjectType: 'group', subjectId: mockGlobalGroupId, scopeType: 'global' }]) };
        }
        return { lean: jest.fn().mockResolvedValue([]) };
      });

      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: 'global.view'
      });

      expect(result.allowed).toBe(true);
    });

    test('handles role-based grants from multiple sources', async () => {
      OrganizationMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ status: 'active' }) });
      
      const mockRoleId1 = new mongoose.Types.ObjectId();
      const mockRoleId2 = new mongoose.Types.ObjectId();
      const mockGroupId = new mongoose.Types.ObjectId();

      RbacUserRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ roleId: mockRoleId1 }]) });
      RbacGroupMember.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ groupId: mockGroupId }]) });
      RbacGroup.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ _id: mockGroupId, orgId: mockOrgId }]) });
      RbacGroupRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ roleId: mockRoleId2, groupId: mockGroupId }]) });

      RbacGrant.find.mockImplementation((query) => {
        if (query.subjectType === 'role' && query.subjectId?.$in?.some(id => String(id) === String(mockRoleId2))) {
          return { lean: jest.fn().mockResolvedValue([{ _id: 'grant-role', effect: 'allow', right: 'settings.edit', subjectType: 'role', subjectId: mockRoleId2, scopeType: 'org' }]) };
        }
        return { lean: jest.fn().mockResolvedValue([]) };
      });

      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: 'settings.edit'
      });

      expect(result.allowed).toBe(true);
      expect(result.decisionLayer).toBe('role');
    });

    test('handles org-level grants', async () => {
      OrganizationMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ status: 'active' }) });
      RbacUserRole.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
      RbacGroupMember.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });

      RbacGrant.find.mockImplementation((query) => {
        if (query.subjectType === 'org' && String(query.subjectId) === String(mockOrgId)) {
          return { lean: jest.fn().mockResolvedValue([{ _id: 'grant-org', effect: 'allow', right: 'org.admin', subjectType: 'org', subjectId: mockOrgId, scopeType: 'global' }]) };
        }
        return { lean: jest.fn().mockResolvedValue([]) };
      });

      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: 'org.admin'
      });

      expect(result.allowed).toBe(true);
      expect(result.decisionLayer).toBe('org');
    });

    test('returns false for invalid right input', async () => {
      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: ''
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('invalid_right');
    });

    test('returns false if user has no active membership in org', async () => {
      OrganizationMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      const result = await rbacService.checkRight({
        userId: mockUserId,
        orgId: mockOrgId,
        right: 'some.right'
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_org_member');
    });
  });
});
