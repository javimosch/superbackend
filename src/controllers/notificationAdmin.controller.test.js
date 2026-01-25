const controller = require('./notificationAdmin.controller');
const Notification = require('../models/Notification');
const notificationService = require('../services/notification.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const mongoose = require('mongoose');

jest.mock('../models/Notification');
jest.mock('../models/User');
jest.mock('../services/notification.service');
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'admin', actorId: 'test' })),
}));

describe('notificationAdmin.controller', () => {
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

  describe('listNotifications', () => {
    test('returns notifications list with pagination', async () => {
      const mockNotifications = [{ _id: 'n1', title: 'Notif 1' }];
      Notification.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockNotifications),
      });
      Notification.countDocuments.mockResolvedValue(1);

      await controller.listNotifications(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        notifications: mockNotifications,
        pagination: expect.objectContaining({ total: 1 })
      }));
    });
  });

  describe('sendNotification', () => {
    test('sends notification to specific users', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockReq.body = {
        userIds: [String(userId)],
        type: 'info',
        title: 'Title',
        message: 'Message'
      };

      notificationService.sendToUsers.mockResolvedValue({ 
        broadcastId: 'b1', 
        results: [{ userId: String(userId), success: true }] 
      });

      await controller.sendNotification(mockReq, mockRes);

      expect(notificationService.sendToUsers).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ broadcastId: 'b1' }));
    });

    test('returns 400 for invalid input', async () => {
      mockReq.body = { type: 'info' }; // Missing title/message
      await controller.sendNotification(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('broadcastNotification', () => {
    test('broadcasts notification to all active users', async () => {
      mockReq.body = {
        type: 'success',
        title: 'Global',
        message: 'Hello'
      };

      notificationService.broadcast.mockResolvedValue({ 
        broadcastId: 'b2', 
        results: [{ userId: 'u1', success: true }] 
      });

      await controller.broadcastNotification(mockReq, mockRes);

      expect(notificationService.broadcast).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe('retryEmailNotification', () => {
    test('retries email for eligible notification', async () => {
      const notifId = new mongoose.Types.ObjectId();
      mockReq.params.id = String(notifId);
      
      const mockNotif = { 
        _id: notifId, 
        channel: 'both', 
        emailStatus: 'failed',
        userId: { email: 'user@test.com' }
      };
      Notification.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockNotif)
      });

      await controller.retryEmailNotification(mockReq, mockRes);

      expect(notificationService.sendEmailForNotification).toHaveBeenCalledWith(mockNotif, 'user@test.com');
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Email retry attempted' }));
    });
  });
});
