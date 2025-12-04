const {
  getUsers,
  getUser,
  updateUserSubscription,
  reconcileUser,
  getWebhookEvents: getAllWebhookEvents,
  retryFailedWebhookEvents,
  retrySingleWebhookEvent: reprocessWebhookEvent,
  getWebhookStats: getSystemStats,
} = require('./admin.controller');
const User = require('../models/User');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const webhookRetry = require('../utils/webhookRetry');

jest.mock('../utils/asyncHandler', () => (fn) => fn);

// Mock dependencies
jest.mock('../models/User');
jest.mock('../models/StripeWebhookEvent');
jest.mock('../utils/webhookRetry');
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      retrieve: jest.fn()
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
        limit: jest.fn().mockResolvedValue(mockUsers)
      });

      await getUsers(mockReq, mockRes);

      expect(User.find).toHaveBeenCalled();
      expect(mockUsers[0].toJSON).toHaveBeenCalled();
      expect(mockUsers[1].toJSON).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith([
        { _id: 'user1', email: 'user1@example.com' },
        { _id: 'user2', email: 'user2@example.com' }
      ]);
    });

    test('should handle empty user list', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      });

      await getUsers(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    test('should exclude password hash from results', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      });

      await getUsers(mockReq, mockRes);

      const findChain = User.find();
      expect(findChain.select).toHaveBeenCalledWith('-passwordHash');
    });

    test('should limit results to 100 users', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      });

      await getUsers(mockReq, mockRes);

      const findChain = User.find();
      const selectChain = findChain.select();
      const sortChain = selectChain.sort();
      expect(sortChain.limit).toHaveBeenCalledWith(100);
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

    test('should handle retry webhook errors', async () => {
      const error = new Error('Retry service unavailable');
      webhookRetry.retryFailedWebhooks.mockRejectedValue(error);

      await retryFailedWebhookEvents(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Error retrying failed webhooks:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to retry webhooks'
      });
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

      expect(mockEvent.status).toBe('failed');
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

  describe('getSystemStats', () => {
    test('should return comprehensive system statistics', async () => {
      // Mock User counts
      User.countDocuments
        .mockResolvedValueOnce(1000) // total users
        .mockResolvedValueOnce(750)  // active subscriptions
        .mockResolvedValueOnce(100); // past due

      // Mock StripeWebhookEvent counts
      StripeWebhookEvent.countDocuments
        .mockResolvedValueOnce(5000) // total events
        .mockResolvedValueOnce(4800) // processed
        .mockResolvedValueOnce(150)  // failed
        .mockResolvedValueOnce(50);  // pending
      
      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      });

      StripeWebhookEvent.aggregate.mockResolvedValue([]);

      await getSystemStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        statusStats: [],
        eventTypeStats: [],
        recentFailures: [],
      });
    });

    test('should handle database errors in system stats', async () => {
      const dbError = new Error('Database connection failed');
      User.countDocuments.mockRejectedValue(dbError);
      StripeWebhookEvent.aggregate.mockResolvedValue([]);
      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      });


      await getSystemStats(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Error fetching system stats:', dbError);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch system statistics'
      });
    });

    test('should include correct system information', async () => {
      User.countDocuments.mockResolvedValue(0);
      StripeWebhookEvent.countDocuments.mockResolvedValue(0);
      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      });
      StripeWebhookEvent.aggregate.mockResolvedValue([]);


      await getSystemStats(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.system.uptime).toBeGreaterThan(0);
      expect(response.system.nodeVersion).toBe(process.version);
      expect(new Date(response.system.timestamp)).toBeInstanceOf(Date);
    });
  });
});