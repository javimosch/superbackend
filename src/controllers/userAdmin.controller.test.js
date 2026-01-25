const controller = require('./userAdmin.controller');
const User = require('../models/User');
const Notification = require('../models/Notification');
const OrganizationMember = require('../models/OrganizationMember');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const mongoose = require('mongoose');

jest.mock('../models/User');
jest.mock('../models/Notification');
jest.mock('../models/OrganizationMember');
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'admin', actorId: 'test' })),
}));

describe('userAdmin.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('listUsers', () => {
    test('returns users list with pagination', async () => {
      const mockUsers = [{ _id: 'u1', email: 'u1@test.com' }];
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers),
      });
      User.countDocuments.mockResolvedValue(1);

      await controller.listUsers(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        users: mockUsers,
        pagination: expect.objectContaining({ total: 1 })
      }));
    });
  });

  describe('getUser', () => {
    test('returns user details and counts', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockReq.params.id = String(userId);
      const mockUser = { _id: userId, email: 'u1@test.com' };
      
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser)
      });
      Notification.countDocuments.mockResolvedValue(5);
      OrganizationMember.countDocuments.mockResolvedValue(2);

      await controller.getUser(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        user: mockUser,
        counts: { notifications: 5, organizations: 2 }
      });
    });

    test('returns 404 if user not found', async () => {
      mockReq.params.id = String(new mongoose.Types.ObjectId());
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      await controller.getUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateUser', () => {
    test('updates user fields successfully', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockReq.params.id = String(userId);
      mockReq.body = { name: 'New Name', role: 'admin' };
      
      const mockUser = { 
        _id: userId, 
        name: 'Old', 
        role: 'user', 
        save: jest.fn().mockResolvedValue(true),
        toJSON: function() { return this; } 
      };
      User.findById.mockResolvedValue(mockUser);

      await controller.updateUser(mockReq, mockRes);

      expect(mockUser.name).toBe('New Name');
      expect(mockUser.role).toBe('admin');
      expect(mockUser.save).toHaveBeenCalled();
      expect(createAuditEvent).toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    test('returns aggregate user statistics', async () => {
      User.countDocuments
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(5)   // admins
        .mockResolvedValueOnce(50)  // active subs
        .mockResolvedValueOnce(2);  // disabled

      await controller.getUserStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        total: 100,
        admins: 5,
        activeSubscriptions: 50,
        disabled: 2
      });
    });
  });
});
