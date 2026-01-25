const mongoose = require('mongoose');
const controller = require('./orgAdmin.controller');
const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const Invite = require('../models/Invite');
const User = require('../models/User');
const GlobalSetting = require('../models/GlobalSetting');
const emailService = require('../services/email.service');
const orgRoles = require('../utils/orgRoles');

jest.mock('../models/Organization');
jest.mock('../models/OrganizationMember');
jest.mock('../models/Invite');
jest.mock('../models/User');
jest.mock('../models/GlobalSetting');
jest.mock('../models/Asset');
jest.mock('../models/Notification');
jest.mock('../services/email.service');
jest.mock('../utils/orgRoles');

// Mock GlobalSetting.findOne to prevent Mongoose buffering timeouts in email.service.js init
GlobalSetting.findOne.mockReturnValue({
  lean: jest.fn().mockResolvedValue(null)
});

describe('orgAdmin.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
      user: { id: 'admin123' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('listOrgs', () => {
    test('returns organizations with pagination', async () => {
      const mockOrgs = [{ _id: 'o1', name: 'Org 1' }];
      Organization.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockOrgs)
      });
      Organization.countDocuments.mockResolvedValue(1);

      await controller.listOrgs(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        orgs: mockOrgs,
        pagination: expect.objectContaining({ total: 1 })
      }));
    });
  });

  describe('createOrganization', () => {
    test('creates new organization successfully', async () => {
      mockReq.body = { name: 'New Org', ownerUserId: String(new mongoose.Types.ObjectId()) };
      User.findById.mockResolvedValue({ _id: mockReq.body.ownerUserId });
      Organization.findOne.mockResolvedValue(null); // No slug conflict
      const mockOrg = { _id: 'o1', name: 'New Org', toObject: () => ({ name: 'New Org' }) };
      Organization.create.mockResolvedValue(mockOrg);

      await controller.createOrganization(mockReq, mockRes);

      expect(Organization.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 400 for short name', async () => {
      mockReq.body = { name: 'a' };
      await controller.createOrganization(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('createInvite', () => {
    test('creates and sends an invite', async () => {
      const orgId = new mongoose.Types.ObjectId();
      mockReq.params.orgId = String(orgId);
      mockReq.body = { email: 'test@test.com', role: 'member' };
      
      orgRoles.getDefaultOrgRole.mockResolvedValue('member');
      orgRoles.isValidOrgRole.mockResolvedValue(true);
      Organization.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: orgId, name: 'Org' }) });
      Invite.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      Invite.generateToken.mockReturnValue({ token: 't1', tokenHash: 'h1' });
      Invite.create.mockResolvedValue({ _id: 'inv1', email: 'test@test.com' });

      await controller.createInvite(mockReq, mockRes);

      expect(Invite.create).toHaveBeenCalled();
      expect(emailService.sendEmail).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe('deleteOrganization', () => {
    test('deletes organization and cleans up data', async () => {
      const orgId = new mongoose.Types.ObjectId();
      const orgIdStr = String(orgId);
      mockReq.params.orgId = orgIdStr;
      
      Organization.findById.mockResolvedValue({ _id: orgId, name: 'Org' });
      OrganizationMember.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue([]) });

      await controller.deleteOrganization(mockReq, mockRes);

      expect(Organization.findByIdAndDelete).toHaveBeenCalledWith(orgIdStr);
      expect(OrganizationMember.deleteMany).toHaveBeenCalledWith({ orgId: orgIdStr });
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Organization deleted successfully' });
    });
  });

  describe('member management', () => {
    test('listMembers returns members using aggregation', async () => {
      mockReq.params.orgId = String(new mongoose.Types.ObjectId());
      const mockMembers = [{ _id: 'm1', user: { email: 'test@test.com' } }];
      OrganizationMember.aggregate
        .mockResolvedValueOnce(mockMembers)
        .mockResolvedValueOnce([{ total: 1 }]);

      await controller.listMembers(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        members: mockMembers,
        pagination: expect.objectContaining({ total: 1 })
      }));
    });

    test('updateMember updates role and status', async () => {
      mockReq.params = { orgId: String(new mongoose.Types.ObjectId()), memberId: String(new mongoose.Types.ObjectId()) };
      mockReq.body = { role: 'admin', status: 'active' };
      
      const mockMember = { 
        role: 'member', 
        status: 'active', 
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };
      OrganizationMember.findOne.mockResolvedValue(mockMember);
      orgRoles.isValidOrgRole.mockResolvedValue(true);

      await controller.updateMember(mockReq, mockRes);

      expect(mockMember.role).toBe('admin');
      expect(mockMember.save).toHaveBeenCalled();
    });

    test('removeMember marks member as removed', async () => {
      mockReq.params = { orgId: String(new mongoose.Types.ObjectId()), memberId: String(new mongoose.Types.ObjectId()) };
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

  describe('invite management', () => {
    test('listInvites returns paginated invites', async () => {
      mockReq.params.orgId = String(new mongoose.Types.ObjectId());
      const mockInvites = [{ email: 't@t.com' }];
      Invite.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockInvites)
      });
      Invite.countDocuments.mockResolvedValue(1);

      await controller.listInvites(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ invites: mockInvites }));
    });

    test('resendInvite generates new token and sends email', async () => {
      const orgId = new mongoose.Types.ObjectId();
      const invId = new mongoose.Types.ObjectId();
      mockReq.params = { orgId: String(orgId), inviteId: String(invId) };
      
      Organization.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: orgId, name: 'Org' }) });
      const mockInvite = { 
        email: 't@t.com', 
        role: 'member', 
        expiresAt: new Date(Date.now() + 100000),
        save: jest.fn().mockResolvedValue(true)
      };
      Invite.findOne.mockResolvedValue(mockInvite);
      Invite.generateToken.mockReturnValue({ token: 'new-t', tokenHash: 'new-h' });

      await controller.resendInvite(mockReq, mockRes);

      expect(mockInvite.save).toHaveBeenCalled();
      expect(emailService.sendEmail).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invite resent successfully' }));
    });
  });
});
