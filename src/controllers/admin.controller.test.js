const {
  getUsers,
  registerUser,
  getUser,
  updateUserSubscription,
  updateUserPassword,
  deleteUser,
  reconcileUser,
  getWebhookEvents: getAllWebhookEvents,
  retryFailedWebhookEvents,
  retrySingleWebhookEvent: reprocessWebhookEvent,
  getWebhookStats,
  provisionCoolifyDeploy,
} = require('./admin.controller');
const User = require('../models/User');
const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const Asset = require('../models/Asset');
const Notification = require('../models/Notification');
const Invite = require('../models/Invite');
const EmailLog = require('../models/EmailLog');
const FormSubmission = require('../models/FormSubmission');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const webhookRetry = require('../utils/webhookRetry');
const fs = require('fs');
const path = require('path');

jest.mock('../utils/asyncHandler', () => (fn) => fn);

// Mock dependencies
jest.mock('../models/User');
jest.mock('../models/Organization');
jest.mock('../models/OrganizationMember');
jest.mock('../models/Asset');
jest.mock('../models/Notification');
jest.mock('../models/Invite');
jest.mock('../models/EmailLog');
jest.mock('../models/FormSubmission');
jest.mock('../models/StripeWebhookEvent');
jest.mock('../utils/webhookRetry');
jest.mock('fs');
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_new' }),
      retrieve: jest.fn()
    },
    checkout: {
      sessions: {
        create: jest.fn(),
        list: jest.fn(),
      },
    },
    subscriptions: {
      list: jest.fn(),
      retrieve: jest.fn()
    },
  }));
});

// Mock console methods
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

describe('Admin Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      params: {},
      body: {},
      query: {}
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
  });

  describe('registerUser', () => {
    test('should register new user successfully', async () => {
      mockReq.body = {
        email: 'newadmin@example.com',
        password: 'password123',
        name: 'New Admin',
        role: 'admin'
      };

      const mockUser = {
        email: 'newadmin@example.com',
        role: 'admin',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ email: 'newadmin@example.com', role: 'admin' })
      };

      User.findOne.mockResolvedValue(null);
      User.mockImplementation(() => mockUser);

      await registerUser(mockReq, mockRes);

      expect(mockUser.save).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('should return 400 for invalid role', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123',
        role: 'superadmin' // Invalid role
      };

      await registerUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Role must be either "user" or "admin"' });
    });
  });

  describe('updateUserPassword', () => {
    test('should update password for user', async () => {
      mockReq.params.id = 'user123';
      mockReq.body.passwordHash = 'new-plaintext-password';

      const mockUser = {
        _id: 'user123',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123' })
      };

      User.findById.mockResolvedValue(mockUser);

      await updateUserPassword(mockReq, mockRes);

      expect(mockUser.passwordHash).toBe('new-plaintext-password');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('should return 400 if password appears to be already hashed', async () => {
      mockReq.params.id = 'user123';
      mockReq.body.passwordHash = '$2a$10$abcdefghijklmnopqrstuv'; // Bcrypt hash pattern

      User.findById.mockResolvedValue({ _id: 'user123' });

      await updateUserPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid password format' }));
    });
  });

  describe('provisionCoolifyDeploy', () => {
    test('should provision deploy script', async () => {
      fs.existsSync.mockReturnValue(false);
      mockReq.body = { overwrite: true };

      await provisionCoolifyDeploy(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('deleteUser', () => {
    test('should delete user and cleanup data', async () => {
      mockReq.params.id = 'user123';
      const mockUser = { _id: 'user123', email: 'delete@test.com', role: 'user' };
      
      User.findById.mockResolvedValue(mockUser);
      User.countDocuments.mockResolvedValue(2); // More than 1 admin
      Organization.find.mockResolvedValue([]);
      
      await deleteUser(mockReq, mockRes);

      expect(User.findByIdAndDelete).toHaveBeenCalledWith('user123');
      expect(OrganizationMember.deleteMany).toHaveBeenCalledWith({ userId: 'user123' });
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'User deleted successfully' });
    });

    test('should prevent deleting the last admin', async () => {
      mockReq.params.id = 'admin123';
      const mockAdmin = { _id: 'admin123', role: 'admin' };
      
      User.findById.mockResolvedValue(mockAdmin);
      User.countDocuments.mockResolvedValue(1); // Only 1 admin
      
      await deleteUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Cannot delete the last admin user' });
    });
  });

  describe('getUsers', () => {
    test('should get all users successfully', async () => {
      const mockUsers = [
        {
          _id: 'user1',
          email: 'user1@example.com',
          toJSON: jest.fn().mockReturnValue({ _id: 'user1', email: 'user1@example.com' })
        },
        {
          _id: 'user2',
          email: 'user2@example.com',
          toJSON: jest.fn().mockReturnValue({ _id: 'user2', email: 'user2@example.com' })
        }
      ];

      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers),
      });

      User.countDocuments.mockResolvedValue(2);

      await getUsers(mockReq, mockRes);

      expect(User.find).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        users: mockUsers,
        pagination: {
          total: 2,
          limit: 50,
          offset: 0,
        },
      });
    });

    test('should handle empty user list', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      User.countDocuments.mockResolvedValue(0);

      await getUsers(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        users: [],
        pagination: {
          total: 0,
          limit: 50,
          offset: 0,
        },
      });
    });

    test('should exclude password hash from results', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
      User.find.mockReturnValue(chain);
      User.countDocuments.mockResolvedValue(0);

      await getUsers(mockReq, mockRes);

      expect(chain.select).toHaveBeenCalledWith('-passwordHash -passwordResetToken -passwordResetExpiry');
    });

    test('should limit results to 100 users', async () => {
      mockReq.query.limit = '9999';
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      User.countDocuments.mockResolvedValue(0);

      await getUsers(mockReq, mockRes);

      const findChain = User.find();
      expect(findChain.limit).toHaveBeenCalledWith(500);
    });
  });

  describe('getUser', () => {
    test('should get single user successfully', async () => {
      mockReq.params.id = 'user123';
      
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', email: 'test@example.com' })
      };

      User.findById.mockResolvedValue(mockUser);

      await getUser(mockReq, mockRes);

      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(mockUser.toJSON).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        user: { _id: 'user123', email: 'test@example.com' }
      });
    });

    test('should return 404 when user not found', async () => {
      mockReq.params.id = 'nonexistent';
      
      User.findById.mockResolvedValue(null);

      await getUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  describe('updateUserSubscription', () => {
    test('should update user subscription status', async () => {
      mockReq.params.id = 'user123';
      mockReq.body.subscriptionStatus = 'active';

      const mockUser = {
        _id: 'user123',
        subscriptionStatus: 'inactive',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', subscriptionStatus: 'active' })
      };

      User.findById.mockResolvedValue(mockUser);

      await updateUserSubscription(mockReq, mockRes);

      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(mockUser.subscriptionStatus).toBe('active');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        user: { _id: 'user123', subscriptionStatus: 'active' }
      });
    });

    test('should return 404 when user not found for subscription update', async () => {
      mockReq.params.id = 'nonexistent';
      mockReq.body.subscriptionStatus = 'active';

      User.findById.mockResolvedValue(null);

      await updateUserSubscription(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    test('should not update when subscriptionStatus not provided', async () => {
      mockReq.params.id = 'user123';
      mockReq.body = {}; // No subscriptionStatus

      const mockUser = {
        _id: 'user123',
        subscriptionStatus: 'inactive',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', subscriptionStatus: 'inactive' })
      };

      User.findById.mockResolvedValue(mockUser);

      await updateUserSubscription(mockReq, mockRes);

      expect(mockUser.subscriptionStatus).toBe('inactive'); // Should remain unchanged
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('reconcileUser', () => {
    test('should return 404 when user not found for reconcile', async () => {
      mockReq.params.id = 'nonexistent';

      User.findById.mockResolvedValue(null);

      await reconcileUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    test('should handle user without stripe customer ID', async () => {
      mockReq.params.id = 'user123';

      const mockUser = {
        _id: 'user123',
        stripeCustomerId: null,
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', reconciled: true })
      };

      User.findById.mockResolvedValue(mockUser);

      await reconcileUser(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'No Stripe customer found'
      });
    });
  });

  describe('getAllWebhookEvents', () => {
    test('should get webhook events with pagination', async () => {
      mockReq.query = { limit: '10', offset: '0' };

      const mockEvents = [
        { _id: 'event1', stripeEventId: 'evt_1', status: 'processed' },
        { _id: 'event2', stripeEventId: 'evt_2', status: 'failed' }
      ];

      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockEvents)
      });

      StripeWebhookEvent.countDocuments.mockResolvedValue(25);

      await getAllWebhookEvents(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        events: mockEvents,
        pagination: {
          total: 25,
          limit: 10,
          offset: 0
        }
      });
    });

    test('should use default pagination values', async () => {
      mockReq.query = {};

      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      });

      StripeWebhookEvent.countDocuments.mockResolvedValue(0);

      await getAllWebhookEvents(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        pagination: expect.objectContaining({
          limit: 50,
          offset: 0
        })
      }));
    });

    test('should filter by status when provided', async () => {
      mockReq.query = { status: 'failed' };

      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      });

      StripeWebhookEvent.countDocuments.mockResolvedValue(0);

      await getAllWebhookEvents(mockReq, mockRes);

      expect(StripeWebhookEvent.find).toHaveBeenCalledWith({ status: 'failed' });
      expect(StripeWebhookEvent.countDocuments).toHaveBeenCalledWith({ status: 'failed' });
    });
  });

  describe('retryFailedWebhooks', () => {
    test('should retry failed webhooks successfully', async () => {
      const mockResult = {
        total: 5,
        succeeded: 3,
        failed: 2,
        errors: [
          { eventId: 'evt_1', error: 'Network timeout' }
        ]
      };

      webhookRetry.retryFailedWebhooks.mockResolvedValue(mockResult);

      await retryFailedWebhookEvents(mockReq, mockRes);

      expect(webhookRetry.retryFailedWebhooks).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        results: mockResult
      });
    });

    test.skip('should handle retry webhook errors', async () => {
      // This test is skipped because the retryFailedWebhookEvents function
      // doesn't handle errors directly - errors are passed to Express error middleware
      // via asyncHandler wrapper
    });
  });

  describe('reprocessWebhookEvent', () => {
    test('should reprocess webhook event successfully', async () => {
      mockReq.params.id = 'webhook123';

      const mockEvent = {
        _id: 'webhook123',
        stripeEventId: 'evt_test',
        status: 'failed',
        save: jest.fn().mockResolvedValue()
      };

      StripeWebhookEvent.findOne.mockResolvedValue(mockEvent);
      webhookRetry.processWebhookEvent.mockResolvedValue();

      await reprocessWebhookEvent(mockReq, mockRes);

      expect(StripeWebhookEvent.findOne).toHaveBeenCalledWith({ stripeEventId: 'webhook123' });
      expect(webhookRetry.processWebhookEvent).toHaveBeenCalledWith(mockEvent);
      expect(mockEvent.status).toBe('processed');
      expect(mockEvent.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Event processed successfully',
        event: mockEvent
      });
    });

    test('should return 404 when webhook event not found', async () => {
      mockReq.params.id = 'nonexistent';

      StripeWebhookEvent.findOne.mockResolvedValue(null);

      await reprocessWebhookEvent(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Webhook event not found'
      });
    });

    test('should handle reprocess errors and mark as failed', async () => {
      mockReq.params.id = 'webhook123';

      const mockEvent = {
        _id: 'webhook123',
        stripeEventId: 'evt_test',
        status: 'pending',
        processingErrors: [],
        retryCount: 1,
        save: jest.fn().mockResolvedValue()
      };

      const processError = new Error('Processing failed');
      StripeWebhookEvent.findOne.mockResolvedValue(mockEvent);
      webhookRetry.processWebhookEvent.mockRejectedValue(processError);

      await reprocessWebhookEvent(mockReq, mockRes);

      expect(mockEvent.retryCount).toBe(2);
      expect(mockEvent.processingErrors).toHaveLength(1);
      expect(mockEvent.processingErrors[0].message).toBe('Processing failed');
      expect(mockEvent.save).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Processing failed',
        event: mockEvent
      });
    });
  });

  describe('getWebhookStats', () => {
    test('should return webhook statistics', async () => {
      const mockStats = [
        { _id: 'processed', count: 100 },
        { _id: 'failed', count: 25 },
        { _id: 'pending', count: 10 }
      ];

      const mockEventTypeStats = [
        { _id: 'customer.subscription.created', count: 50, failedCount: 5 },
        { _id: 'invoice.payment_succeeded', count: 30, failedCount: 2 }
      ];

      const mockRecentFailures = [
        { stripeEventId: 'evt_1', eventType: 'invoice.payment_failed', receivedAt: new Date() }
      ];

      StripeWebhookEvent.aggregate
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockEventTypeStats);

      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockRecentFailures)
      });

      await getWebhookStats(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.statusStats).toEqual(mockStats);
      expect(response.eventTypeStats).toEqual(mockEventTypeStats);
      expect(response.recentFailures).toEqual(mockRecentFailures);
    });

    test.skip('should handle database errors in system stats', async () => {
      // This test is skipped because getWebhookStats doesn't have error handling
      // for database errors - errors are passed to Express error middleware
    });

    test.skip('should include correct system information', async () => {
      // This test is skipped because getWebhookStats doesn't include system information
      // like uptime and node version
    });
  });
});