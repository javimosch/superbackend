const {
  createCheckoutSession,
  createPortalSession,
  reconcileSubscription,
  handleWebhook,
} = require('./billing.controller');
const stripe = require('stripe');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const stripeService = require('../services/stripe.service');

jest.mock('../utils/asyncHandler', () => (fn) => fn);
jest.mock('../models/StripeWebhookEvent');
jest.mock('../services/stripe.service');

// Mock the stripe library
jest.mock('stripe', () => {
  const mStripe = {
    customers: {
      create: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
        list: jest.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn(),
      },
    },
    subscriptions: {
        list: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
  return jest.fn(() => mStripe);
});

describe('Billing Controller', () => {
  let mockReq;
  let mockRes;
  let next;
  const mStripe = stripe();

  beforeEach(() => {
    mockReq = {
      user: {
        _id: 'user123',
        email: 'test@example.com',
        save: jest.fn().mockResolvedValue(true),
      },
      body: {},
      headers: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    const webhookSecret = 'whsec_test';
    const sig = 't=123,v1=abc';

    beforeEach(() => {
      process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
      mockReq.headers['stripe-signature'] = sig;
      mockReq.body = Buffer.from('{"id":"evt_123"}');
    });

    test('should return 400 if signature verification fails', async () => {
      mStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('Invalid signature'));
    });

    test('should return duplicate status if event already processed', async () => {
      const mockEvent = { id: 'evt_123', type: 'test' };
      mStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      StripeWebhookEvent.findOne.mockResolvedValue({ status: 'processed' });

      await handleWebhook(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ received: true, status: 'duplicate' });
    });

    test('should process checkout.session.completed event', async () => {
      const mockEvent = { 
        id: 'evt_123', 
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_123' } }
      };
      mStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      StripeWebhookEvent.findOne.mockResolvedValue(null);
      
      const mockDoc = { save: jest.fn().mockResolvedValue(true), status: 'received', processingErrors: [] };
      StripeWebhookEvent.mockImplementation(() => mockDoc);

      await handleWebhook(mockReq, mockRes);

      expect(stripeService.handleCheckoutSessionCompleted).toHaveBeenCalledWith(mockEvent.data.object);
      expect(mockDoc.status).toBe('processed');
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    test('should handle subscription created event', async () => {
      const mockEvent = { 
        id: 'evt_123', 
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_123' } }
      };
      mStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      StripeWebhookEvent.findOne.mockResolvedValue(null);
      
      const mockDoc = { save: jest.fn().mockResolvedValue(true), status: 'received', processingErrors: [] };
      StripeWebhookEvent.mockImplementation(() => mockDoc);

      await handleWebhook(mockReq, mockRes);

      expect(stripeService.handleSubscriptionCreated).toHaveBeenCalledWith(mockEvent.data.object);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session for a new Stripe customer', async () => {
      mockReq.body = {
        priceId: 'price_123',
        billingMode: 'subscription'
      };
      mockReq.user.stripeCustomerId = null;

      mStripe.customers.create.mockResolvedValue({
        id: 'cust_new'
      });
      mStripe.checkout.sessions.create.mockResolvedValue({
        id: 'sess_123',
        url: 'http://checkout.url'
      });

      await createCheckoutSession(mockReq, mockRes, next);

      expect(mStripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        metadata: {
          userId: 'user123'
        },
      });
      expect(mockReq.user.save).toHaveBeenCalled();
      expect(mStripe.checkout.sessions.create).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        sessionId: 'sess_123',
        url: 'http://checkout.url'
      });
    });

    it('should create a checkout session for an existing Stripe customer', async () => {
      mockReq.body = {
        priceId: 'price_456',
        billingMode: 'payment'
      };
      mockReq.user.stripeCustomerId = 'cust_existing';

      mStripe.checkout.sessions.create.mockResolvedValue({
        id: 'sess_456',
        url: 'http://payment.url'
      });

      await createCheckoutSession(mockReq, mockRes, next);

      expect(mStripe.customers.create).not.toHaveBeenCalled();
      expect(mockReq.user.save).not.toHaveBeenCalled();
      expect(mStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cust_existing',
          mode: 'payment',
        })
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        sessionId: 'sess_456',
        url: 'http://payment.url'
      });
    });

    it('should return 400 if priceId is missing', async () => {
      mockReq.body = {}; // No priceId

      await createCheckoutSession(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'priceId is required'
      });
    });
  });

  describe('createPortalSession', () => {
    it('should create a portal session for a customer', async () => {
      mockReq.user.stripeCustomerId = 'cust_portal';
      mStripe.billingPortal.sessions.create.mockResolvedValue({
        url: 'http://portal.url'
      });

      await createPortalSession(mockReq, mockRes, next);

      expect(mStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cust_portal',
        return_url: expect.any(String),
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        url: 'http://portal.url'
      });
    });

    it('should return 400 if no Stripe customer ID exists', async () => {
      mockReq.user.stripeCustomerId = null;

      await createPortalSession(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No Stripe customer found'
      });
    });
  });

  describe('reconcileSubscription', () => {
    it('should update user with active subscription from Stripe', async () => {
      mockReq.user.stripeCustomerId = 'cust_with_sub';
      mStripe.subscriptions.list.mockResolvedValue({
        data: [{
          id: 'sub_123',
          status: 'active'
        }]
      });

      await reconcileSubscription(mockReq, mockRes, next);

      expect(mockReq.user.stripeSubscriptionId).toBe('sub_123');
      expect(mockReq.user.subscriptionStatus).toBe('active');
      expect(mockReq.user.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        subscriptionStatus: 'active'
      });
    });

    it('should update user with active status for a one-time payment', async () => {
      mockReq.user.stripeCustomerId = 'cust_with_payment';
      mStripe.subscriptions.list.mockResolvedValue({
        data: []
      });
      mStripe.checkout.sessions.list.mockResolvedValue({
        data: [{
          payment_status: 'paid',
          mode: 'payment'
        }]
      });

      await reconcileSubscription(mockReq, mockRes, next);

      expect(mockReq.user.subscriptionStatus).toBe('active');
      expect(mockReq.user.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        subscriptionStatus: 'active'
      });
    });

    it('should update user with "none" status if no subscriptions or payments found', async () => {
      mockReq.user.stripeCustomerId = 'cust_with_nothing';
      mStripe.subscriptions.list.mockResolvedValue({
        data: []
      });
      mStripe.checkout.sessions.list.mockResolvedValue({
        data: []
      });

      await reconcileSubscription(mockReq, mockRes, next);

      expect(mockReq.user.subscriptionStatus).toBe('none');
      expect(mockReq.user.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'success',
        subscriptionStatus: 'none'
      });
    });

    it('should do nothing if user has no stripe customer id', async () => {
        mockReq.user.stripeCustomerId = null;
  
        await reconcileSubscription(mockReq, mockRes, next);
  
        expect(mStripe.subscriptions.list).not.toHaveBeenCalled();
        expect(mockRes.json).toHaveBeenCalledWith({ status: "success", message: "No Stripe customer found" });
      });
  });
});