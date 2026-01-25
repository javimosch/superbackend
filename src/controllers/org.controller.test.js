const controller = require('./org.controller');
const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const User = require('../models/User');
const emailService = require('../services/email.service');
const orgRoles = require('../utils/orgRoles');
const mongoose = require('mongoose');

jest.mock('../models/Organization');
jest.mock('../models/OrganizationMember');
jest.mock('../models/User');
jest.mock('../services/email.service');
jest.mock('../utils/orgRoles');

describe('org.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { _id: new mongoose.Types.ObjectId(), email: 'user@test.com' },
      body: {},
      query: {},
      params: {},
      org: { _id: new mongoose.Types.ObjectId(), toJSON: () => ({ name: 'Org' }) },
      orgMember: { role: 'admin' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('listOrgs', () => {
    test('returns user memberships', async () => {
      const mockMembership = {
        orgId: { _id: 'o1', status: 'active', toJSON: () => ({ name: 'Org 1' }) },
        role: 'admin'
      };
      OrganizationMember.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockMembership])
      });

      await controller.listOrgs(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        orgs: [expect.objectContaining({ name: 'Org 1', myRole: 'admin' })]
      });
    });
  });

  describe('createOrg', () => {
    test('creates new organization and member record', async () => {
      mockReq.body = { name: 'New Org' };
      Organization.findOne.mockResolvedValue(null);
      const mockOrg = { 
        _id: 'o1', 
        name: 'New Org', 
        toJSON: () => ({ _id: 'o1', name: 'New Org' }) 
      };
      Organization.create.mockResolvedValue(mockOrg);

      await controller.createOrg(mockReq, mockRes);

      expect(Organization.create).toHaveBeenCalled();
      expect(OrganizationMember.create).toHaveBeenCalledWith(expect.objectContaining({
        orgId: 'o1',
        role: 'owner'
      }));
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe('addMember', () => {
    test('adds existing user to organization', async () => {
      mockReq.body = { email: 'member@test.com', role: 'member' };
      orgRoles.getDefaultOrgRole.mockResolvedValue('member');
      orgRoles.isValidOrgRole.mockResolvedValue(true);
      
      User.findOne.mockResolvedValue({ _id: 'u2', email: 'member@test.com' });
      OrganizationMember.findOne.mockResolvedValue(null);

      await controller.addMember(mockReq, mockRes);

      expect(OrganizationMember.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 404 if user not found', async () => {
      mockReq.body = { email: 'missing@test.com' };
      orgRoles.isValidOrgRole.mockResolvedValue(true);
      User.findOne.mockResolvedValue(null);

      await controller.addMember(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('joinOrg', () => {
    test('allows joining if public join is enabled', async () => {
      mockReq.org.allowPublicJoin = true;
      orgRoles.getDefaultOrgRole.mockResolvedValue('member');
      OrganizationMember.findOne.mockResolvedValue(null);

      await controller.joinOrg(mockReq, mockRes);

      expect(OrganizationMember.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('rejects joining if public join is disabled', async () => {
      mockReq.org.allowPublicJoin = false;
      await controller.joinOrg(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('member management', () => {
    test('listMembers returns members with populated user info', async () => {
      const mockMembers = [{ _id: 'm1', role: 'admin', userId: { _id: 'u1', email: 'u1@t.com', name: 'U1' } }];
      OrganizationMember.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockMembers)
      });

      await controller.listMembers(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        members: expect.arrayContaining([expect.objectContaining({ email: 'u1@t.com' })])
      });
    });

    test('updateMemberRole updates role for existing member', async () => {
      mockReq.params.userId = 'u2';
      mockReq.body.role = 'admin';
      
      const mockMember = { 
        role: 'member', 
        save: jest.fn().mockResolvedValue(true)
      };
      OrganizationMember.findOne.mockResolvedValue(mockMember);
      orgRoles.isValidOrgRole.mockResolvedValue(true);

      await controller.updateMemberRole(mockReq, mockRes);

      expect(mockMember.role).toBe('admin');
      expect(mockMember.save).toHaveBeenCalled();
    });

    test('removeMember sets status to removed', async () => {
      mockReq.params.userId = 'u2';
      const mockMember = { 
        role: 'member', 
        save: jest.fn().mockResolvedValue(true)
      };
      OrganizationMember.findOne.mockResolvedValue(mockMember);

      await controller.removeMember(mockReq, mockRes);

      expect(mockMember.status).toBe('removed');
      expect(mockMember.save).toHaveBeenCalled();
    });
  });

  describe('Public access', () => {
    test('listPublicOrgs returns active public organizations', async () => {
      const mockOrgs = [{ name: 'Public Org', slug: 'public' }];
      Organization.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockOrgs)
      });

      await controller.listPublicOrgs(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        orgs: expect.arrayContaining([expect.objectContaining({ slug: 'public' })])
      });
    });

    test('getOrgPublic returns public org info', async () => {
      mockReq.params.orgId = 'o1';
      const mockOrg = { _id: 'o1', name: 'Org', slug: 'org', allowPublicJoin: true };
      Organization.findOne.mockResolvedValue(mockOrg);

      await controller.getOrgPublic(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        org: expect.objectContaining({ slug: 'org' })
      });
    });
  });
});
