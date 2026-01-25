const controller = require('./adminRbac.controller');

const mongoose = require('mongoose');

const User = require('../models/User');
const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const RbacRole = require('../models/RbacRole');
const RbacGroup = require('../models/RbacGroup');
const RbacGroupMember = require('../models/RbacGroupMember');
const RbacGroupRole = require('../models/RbacGroupRole');
const RbacGrant = require('../models/RbacGrant');
const rbacService = require('../services/rbac.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');

jest.mock('../models/User');
jest.mock('../models/Organization');
jest.mock('../models/OrganizationMember');
jest.mock('../models/RbacRole');
jest.mock('../models/RbacGroup');
jest.mock('../models/RbacGroupMember');
jest.mock('../models/RbacGroupRole');
jest.mock('../models/RbacGrant');
jest.mock('../services/rbac.service');
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'basic', actorId: 'test' })),
}));

describe('adminRbac.controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = { params: {}, query: {}, body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('searchUsers', () => {
    test('filters by orgId when provided', async () => {
      const orgId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      mockReq.query = { q: 'alice', limit: '10', orgId: String(orgId) };

      OrganizationMember.aggregate.mockResolvedValue([
        {
          user: {
            _id: userId,
            email: 'alice@example.com',
            name: 'Alice',
            role: 'user',
          },
        },
      ]);

      await controller.searchUsers(mockReq, mockRes);

      expect(OrganizationMember.aggregate).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        users: [
          {
            id: String(userId),
            email: 'alice@example.com',
            name: 'Alice',
            role: 'user',
          },
        ],
      });
      expect(User.find).not.toHaveBeenCalled();
    });

    test('returns 400 on invalid orgId', async () => {
      mockReq.query = { q: 'alice', orgId: 'not-an-objectid' };

      await controller.searchUsers(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid orgId' });
    });
  });

  describe('roles management', () => {
    test('listRoles returns all roles', async () => {
      const mockRoles = [{ _id: 'r1', key: 'admin', isGlobal: true }];
      RbacRole.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockRoles)
      });

      await controller.listRoles(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        roles: expect.arrayContaining([expect.objectContaining({ key: 'admin' })])
      });
    });

    test('createRole creates a global role', async () => {
      mockReq.body = { key: 'editor', name: 'Editor', isGlobal: true };
      const mockDoc = { _id: 'r2', ...mockReq.body, toObject: () => ({ _id: 'r2', ...mockReq.body }) };
      RbacRole.create.mockResolvedValue(mockDoc);

      await controller.createRole(mockReq, mockRes);

      expect(RbacRole.create).toHaveBeenCalledWith(expect.objectContaining({ isGlobal: true }));
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe('groups management', () => {
    test('listGroups returns all groups', async () => {
      const mockGroups = [{ _id: 'g1', name: 'Team A' }];
      RbacGroup.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockGroups)
      });

      await controller.listGroups(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        groups: expect.arrayContaining([expect.objectContaining({ name: 'Team A' })])
      });
    });
  });

  describe('addGroupMember', () => {
    test('rejects org-scoped group member add when user not in org', async () => {
      const groupId = new mongoose.Types.ObjectId();
      const orgId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      mockReq.params = { id: String(groupId) };
      mockReq.body = { userId: String(userId) }; 

      RbacGroup.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: groupId, isGlobal: false, orgId, status: 'active' }),
      });

      OrganizationMember.exists.mockResolvedValue(false);

      await controller.addGroupMember(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User is not an active member of the group org' });
      expect(RbacGroupMember.create).not.toHaveBeenCalled();
    });
  });

  describe('addGroupMembersBulk', () => {
    test('adds members in bulk for global group', async () => {
      const groupId = new mongoose.Types.ObjectId();
      const userId1 = new mongoose.Types.ObjectId();
      const userId2 = new mongoose.Types.ObjectId();

      mockReq.params = { id: String(groupId) };
      mockReq.body = { userIds: [String(userId1), String(userId2)] };

      RbacGroup.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: groupId, isGlobal: true, orgId: null, status: 'active' }),
      });

      RbacGroupMember.insertMany.mockResolvedValue([{ _id: 1 }, { _id: 2 }]);

      await controller.addGroupMembersBulk(mockReq, mockRes);

      expect(RbacGroupMember.insertMany).toHaveBeenCalled();
      expect(createAuditEvent).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, insertedCount: 2 });
    });

    test('rejects org-scoped group when some users are not active org members', async () => {
      const groupId = new mongoose.Types.ObjectId();
      const orgId = new mongoose.Types.ObjectId();
      const userId1 = new mongoose.Types.ObjectId();
      const userId2 = new mongoose.Types.ObjectId();

      mockReq.params = { id: String(groupId) };
      mockReq.body = { userIds: [String(userId1), String(userId2)] };

      RbacGroup.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: groupId, isGlobal: false, orgId, status: 'active' }),
      });

      OrganizationMember.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ userId: userId1 }]),
      });

      await controller.addGroupMembersBulk(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Some users are not active members of the group org',
        deniedUserIds: [String(userId2)],
      });
      expect(RbacGroupMember.insertMany).not.toHaveBeenCalled();
    });

    test('swallows duplicate key errors and returns insertedCount', async () => {
      const groupId = new mongoose.Types.ObjectId();
      const userId1 = new mongoose.Types.ObjectId();
      const userId2 = new mongoose.Types.ObjectId();

      mockReq.params = { id: String(groupId) };
      mockReq.body = { userIds: [String(userId1), String(userId2)] };

      RbacGroup.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: groupId, isGlobal: true, orgId: null, status: 'active' }),
      });

      const err = new Error('dup');
      err.writeErrors = [{ code: 11000 }];
      err.insertedDocs = [{ _id: 1 }];
      RbacGroupMember.insertMany.mockRejectedValue(err);

      await controller.addGroupMembersBulk(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, insertedCount: 1 });
    });
  });

  describe('removeGroupMembersBulk', () => {
    test('removes members in bulk', async () => {
      const groupId = new mongoose.Types.ObjectId();
      const memberId1 = new mongoose.Types.ObjectId();
      const memberId2 = new mongoose.Types.ObjectId();

      mockReq.params = { id: String(groupId) };
      mockReq.body = { memberIds: [String(memberId1), String(memberId2)] };

      RbacGroupMember.deleteMany.mockResolvedValue({ deletedCount: 2 });

      await controller.removeGroupMembersBulk(mockReq, mockRes);

      expect(RbacGroupMember.deleteMany).toHaveBeenCalledWith({
        groupId: String(groupId),
        _id: { $in: [String(memberId1), String(memberId2)] },
      });
      expect(createAuditEvent).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, deletedCount: 2 });
    });
  });

  describe('grants management', () => {
    test('listGrants returns grants with filters', async () => {
      const mockGrants = [{ _id: 'g1', subjectType: 'role', subjectId: 'r1' }];
      RbacGrant.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockGrants)
      });

      await controller.listGrants(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        grants: expect.arrayContaining([expect.objectContaining({ subjectType: 'role' })])
      });
    });

    test('createGrant creates a new grant', async () => {
      const subjectId = new mongoose.Types.ObjectId();
      mockReq.body = { subjectType: 'user', subjectId: String(subjectId), scopeType: 'global', right: 'users.read' };
      const mockDoc = { _id: 'grant1', ...mockReq.body, toObject: () => ({ _id: 'grant1', ...mockReq.body }) };
      RbacGrant.create.mockResolvedValue(mockDoc);

      await controller.createGrant(mockReq, mockRes);

      expect(RbacGrant.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });
});
