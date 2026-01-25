const controller = require('./invite.controller');
const Invite = require('../models/Invite');
const User = require('../models/User');
const OrganizationMember = require('../models/OrganizationMember');
const GlobalSetting = require('../models/GlobalSetting');
const emailService = require('../services/email.service');
const orgRoles = require('../utils/orgRoles');
const mongoose = require('mongoose');

jest.mock('../models/Invite');
jest.mock('../models/User');
jest.mock('../models/OrganizationMember');
jest.mock('../models/GlobalSetting');
jest.mock('../services/email.service');
jest.mock('../utils/orgRoles');

// Mock GlobalSetting.findOne to prevent Mongoose buffering timeouts in email.service.js init
GlobalSetting.findOne.mockReturnValue({
  lean: jest.fn().mockResolvedValue(null)
});

describe('invite.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      body: {},
      params: {},
      query: {},
      org: { _id: 'org123', name: 'Test Org' },
      user: { _id: 'user123' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('createInvite', () => {
    test('creates and sends an invite successfully', async () => {
      mockReq.body = { email: 'new@test.com', role: 'member' };
      orgRoles.getDefaultOrgRole.mockResolvedValue('member');
      orgRoles.isValidOrgRole.mockResolvedValue(true);
      
      User.findOne.mockResolvedValue(null);
      Invite.findOne.mockResolvedValue(null);
      Invite.generateToken.mockReturnValue({ token: 't1', tokenHash: 'h1' });
      
      const mockInvite = { _id: 'inv1', email: 'new@test.com', role: 'member' };
      Invite.create.mockResolvedValue(mockInvite);

      await controller.createInvite(mockReq, mockRes);

      expect(Invite.create).toHaveBeenCalled();
      expect(emailService.sendEmail).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 409 if user is already a member', async () => {
      mockReq.body = { email: 'existing@test.com' };
      orgRoles.isValidOrgRole.mockResolvedValue(true);
      
      User.findOne.mockResolvedValue({ _id: 'u1' });
      OrganizationMember.findOne.mockResolvedValue({ _id: 'm1' });

      await controller.createInvite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User is already a member' });
    });
  });

  describe('acceptInvite', () => {
    test('accepts invite and creates user membership', async () => {
      mockReq.body = { token: 'valid-token' };
      Invite.hashToken.mockReturnValue('h1');
      
      const mockInvite = {
        email: 'invited@test.com',
        status: 'pending',
        role: 'member',
        orgId: { _id: 'org123', name: 'Org', slug: 'org' },
        expiresAt: new Date(Date.now() + 10000),
        save: jest.fn().mockResolvedValue(true)
      };
      Invite.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockInvite) });
      
      User.findOne.mockResolvedValue({ _id: 'u1' });
      OrganizationMember.findOne.mockResolvedValue(null);

      await controller.acceptInvite(mockReq, mockRes);

      expect(OrganizationMember.create).toHaveBeenCalled();
      expect(mockInvite.status).toBe('accepted');
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invite accepted successfully' }));
    });
  });

  describe('listInvites', () => {
    test('returns all pending invites for the organization', async () => {
      const mockInvites = [{ email: 'test@test.com', role: 'member' }];
      Invite.find.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockInvites)
      });

      await controller.listInvites(mockReq, mockRes);

      expect(Invite.find).toHaveBeenCalledWith({ orgId: 'org123', status: 'pending' });
      expect(mockRes.json).toHaveBeenCalledWith({ invites: mockInvites });
    });
  });

  describe('revokeInvite', () => {
    test('marks a pending invite as revoked', async () => {
      mockReq.params.inviteId = 'inv123';
      const mockInvite = {
        status: 'pending',
        save: jest.fn().mockResolvedValue(true)
      };
      Invite.findOne.mockResolvedValue(mockInvite);

      await controller.revokeInvite(mockReq, mockRes);

      expect(mockInvite.status).toBe('revoked');
      expect(mockInvite.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invite revoked successfully' });
    });

    test('returns 404 if invite not found or not pending', async () => {
      mockReq.params.inviteId = 'missing';
      Invite.findOne.mockResolvedValue(null);

      await controller.revokeInvite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getInviteInfo', () => {
    test('returns public info for a valid invite token', async () => {
      mockReq.query.token = 't1';
      Invite.hashToken.mockReturnValue('h1');
      const mockInvite = {
        email: 't@t.com',
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 10000),
        orgId: { name: 'Org', slug: 'org' }
      };
      Invite.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockInvite)
      });
      User.findOne.mockResolvedValue(null);

      await controller.getInviteInfo(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        invite: expect.objectContaining({ email: 't@t.com' }),
        userExists: false
      }));
    });
  });
});
