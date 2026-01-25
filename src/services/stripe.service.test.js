const StripeService = require('./stripe.service');
const User = require('../models/User');

// Mock stripe
jest.mock('stripe', () => {
  const mockStripe = {
    subscriptions: {
      retrieve: jest.fn()
    }
  };
  return jest.fn(() => mockStripe);
});

// Mock User model
jest.mock('../models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn()
}));

// Mock stripeHelper service
jest.mock('./stripeHelper.service', () => ({
  getStripeClient: jest.fn(),
  resolvePlanKeyFromPriceId: jest.fn()
}));

// Mock StripeCatalogItem model
jest.mock('../models/StripeCatalogItem', () => ({
  findOne: jest.fn()
}));

describe('StripeService', () => {
  let mockStripe;
  let mockUser;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mocked stripe instance
    const stripe = require('stripe');
    mockStripe = stripe();
    
    // Mock stripeHelper service
    const stripeHelper = require('./stripeHelper.service');
    stripeHelper.getStripeClient.mockResolvedValue(mockStripe);
    stripeHelper.resolvePlanKeyFromPriceId.mockImplementation((priceId) => {
      if (priceId === 'price_creator') return 'creator';
      if (priceId === 'price_pro') return 'pro';
      return 'creator'; // default for unknown price
    });
    
    mockUser = {
      _id: 'user123',
      email: 'test@example.com',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: null,
      subscriptionStatus: 'inactive',
      currentPlan: 'free',
      save: jest.fn().mockResolvedValue(true)
    };
    
    // Set up environment variables
    process.env.STRIPE_PRICE_ID_CREATOR = 'price_creator';
    process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
  });

  describe('handleCheckoutSessionCompleted', () => {
    test('should handle checkout completion with subscription', async () => {
      const session = {
        customer: 'cus_123',
        subscription: 'sub_123',
        metadata: { userId: 'user123', billingMode: 'subscription' },
        mode: 'subscription'
      };

      User.findOne.mockResolvedValue(mockUser);
      
      const mockSubscription = {
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_creator' } }]
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      await StripeService.handleCheckoutSessionCompleted(session);

      expect(User.findOne).toHaveBeenCalledWith({ stripeCustomerId: 'cus_123' });
      expect(mockUser.stripeSubscriptionId).toBe('sub_123');
      expect(mockUser.currentPlan).toBe('creator');
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should handle checkout completion with payment mode', async () => {
      const session = {
        customer: 'cus_123',
        subscription: null,
        metadata: { billingMode: 'payment' },
        mode: 'payment'
      };

      User.findOne.mockResolvedValue(mockUser);

      await StripeService.handleCheckoutSessionCompleted(session);

      expect(mockUser.subscriptionStatus).toBe('active');
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should handle missing customer ID', async () => {
      const session = {
        customer: null,
        subscription: 'sub_123'
      };

      await expect(StripeService.handleCheckoutSessionCompleted(session))
        .rejects.toThrow('No customer ID in session');
    });

    test('should find user by userId when customer lookup fails', async () => {
      const session = {
        customer: 'cus_123',
        subscription: 'sub_123',
        metadata: { userId: 'user123' },
        mode: 'subscription'
      };

      User.findOne.mockResolvedValueOnce(null); // First call fails
      User.findById.mockResolvedValue(mockUser);
      
      const mockSubscription = {
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_pro' } }]
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      await StripeService.handleCheckoutSessionCompleted(session);

      expect(User.findOne).toHaveBeenCalledWith({ stripeCustomerId: 'cus_123' });
      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(mockUser.currentPlan).toBe('pro');
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should handle user not found scenario', async () => {
      const session = {
        customer: 'cus_123',
        subscription: 'sub_123',
        metadata: { userId: 'user123' }
      };

      User.findOne.mockResolvedValue(null);
      User.findById.mockResolvedValue(null);

      // Should not throw, just log warning
      await StripeService.handleCheckoutSessionCompleted(session);

      expect(User.findOne).toHaveBeenCalled();
      expect(User.findById).toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionCreated', () => {
    test('should create subscription successfully', async () => {
      const subscription = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active'
      };

      User.findOne.mockResolvedValue(mockUser);
      
      const mockSubscriptionDetails = {
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_creator' } }]
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscriptionDetails);

      await StripeService.handleSubscriptionCreated(subscription);

      expect(mockUser.stripeSubscriptionId).toBe('sub_123');
      expect(mockUser.subscriptionStatus).toBe('active');
      expect(mockUser.currentPlan).toBe('creator');
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should handle user not found', async () => {
      const subscription = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active'
      };

      User.findOne.mockResolvedValue(null);

      await StripeService.handleSubscriptionCreated(subscription);

      expect(User.findOne).toHaveBeenCalledWith({ stripeCustomerId: 'cus_123' });
      // Should not throw, just log warning
    });
  });

  describe('handleSubscriptionUpdated', () => {
    test('should update subscription successfully', async () => {
      const subscription = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'past_due'
      };
      const previousAttributes = { status: 'active' };

      mockUser.subscriptionStatus = 'active';
      User.findOne.mockResolvedValue(mockUser);
      
      const mockSubscriptionDetails = {
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_pro' } }]
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscriptionDetails);

      await StripeService.handleSubscriptionUpdated(subscription, previousAttributes);

      expect(mockUser.subscriptionStatus).toBe('past_due');
      expect(mockUser.currentPlan).toBe('pro');
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionDeleted', () => {
    test('should delete subscription successfully', async () => {
      const subscription = {
        id: 'sub_123',
        customer: 'cus_123'
      };

      User.findOne.mockResolvedValue(mockUser);

      await StripeService.handleSubscriptionDeleted(subscription);

      expect(mockUser.subscriptionStatus).toBe('cancelled');
      expect(mockUser.currentPlan).toBe('free');
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('handleInvoicePaymentSucceeded', () => {
    test('should handle successful payment for inactive user', async () => {
      const invoice = {
        customer: 'cus_123'
      };

      mockUser.subscriptionStatus = 'past_due';
      mockUser.stripeSubscriptionId = 'sub_123';
      User.findOne.mockResolvedValue(mockUser);
      
      const mockSubscription = {
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_creator' } }]
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      await StripeService.handleInvoicePaymentSucceeded(invoice);

      expect(mockUser.subscriptionStatus).toBe('active');
      expect(mockUser.currentPlan).toBe('creator');
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should not update already active user', async () => {
      const invoice = {
        customer: 'cus_123'
      };

      mockUser.subscriptionStatus = 'active';
      User.findOne.mockResolvedValue(mockUser);

      await StripeService.handleInvoicePaymentSucceeded(invoice);

      expect(mockUser.save).not.toHaveBeenCalled();
    });
  });

  describe('handleInvoicePaymentFailed', () => {
    test('should handle failed payment', async () => {
      const invoice = {
        customer: 'cus_123'
      };

      User.findOne.mockResolvedValue(mockUser);

      await StripeService.handleInvoicePaymentFailed(invoice);

      expect(mockUser.subscriptionStatus).toBe('past_due');
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('updateUserPlanFromSubscription', () => {
    test('should update user plan to creator', async () => {
      const mockSubscription = {
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_creator' } }]
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      await StripeService.updateUserPlanFromSubscription(mockUser, 'sub_123');

      expect(mockUser.currentPlan).toBe('creator');
    });

    test('should update user plan to pro', async () => {
      const mockSubscription = {
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_pro' } }]
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      await StripeService.updateUserPlanFromSubscription(mockUser, 'sub_123');

      expect(mockUser.currentPlan).toBe('pro');
    });

    test('should default to creator for unknown price', async () => {
      const mockSubscription = {
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_unknown' } }]
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      await StripeService.updateUserPlanFromSubscription(mockUser, 'sub_123');

      expect(mockUser.currentPlan).toBe('creator');
    });

    test('should handle stripe error gracefully', async () => {
      mockStripe.subscriptions.retrieve.mockRejectedValue(new Error('Stripe error'));

      // Should not throw
      await StripeService.updateUserPlanFromSubscription(mockUser, 'sub_123');

      // Plan should not change on error
      expect(mockUser.currentPlan).toBe('free');
    });

    test('should handle missing price in subscription', async () => {
      const mockSubscription = {
        id: 'sub_123',
        items: {
          data: [] // No items
        }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

      await StripeService.updateUserPlanFromSubscription(mockUser, 'sub_123');

      // Should resolve to creator (default for unknown/missing price)
      expect(mockUser.currentPlan).toBe('creator');
    });
  });

  describe('getStatusMapping', () => {
    test('should return correct status mapping', () => {
      const mapping = StripeService.getStatusMapping();

      expect(mapping).toEqual({
        'active': 'active',
        'past_due': 'past_due',
        'unpaid': 'unpaid',
        'canceled': 'cancelled',
        'incomplete': 'incomplete',
        'incomplete_expired': 'incomplete_expired',
        'trialing': 'trialing'
      });
    });

    test('should handle all mapped statuses in handleSubscriptionUpdated', async () => {
      const statuses = ['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'trialing'];
      User.findOne.mockResolvedValue(mockUser);
      
      const mockSubscriptionDetails = {
        id: 'sub_123',
        items: { data: [{ price: { id: 'price_pro' } }] }
      };
      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscriptionDetails);

      for (const status of statuses) {
        const subscription = { id: 'sub_123', customer: 'cus_123', status };
        await StripeService.handleSubscriptionUpdated(subscription);
        const expected = status === 'canceled' ? 'cancelled' : status;
        expect(mockUser.subscriptionStatus).toBe(expected);
      }
    });
  });
});