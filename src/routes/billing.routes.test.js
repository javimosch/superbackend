const express = require('express');
const request = require('supertest');

// Mock the controller
const mockBillingController = {
  createCheckoutSession: jest.fn(),
  createPortalSession: jest.fn(),
  reconcileSubscription: jest.fn()
};

// Mock the auth middleware
const mockAuthMiddleware = {
  authenticate: jest.fn((req, res, next) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' };
    next();
  })
};

// Mock the audit middleware
const mockAuditMiddleware = {
  auditMiddleware: jest.fn().mockImplementation((action, options) => (req, res, next) => {
    req.auditAction = action;
    req.auditOptions = options;
    next();
  })
};

// Mock modules before requiring the routes
jest.mock('../controllers/billing.controller', () => mockBillingController);
jest.mock('../middleware/auth', () => mockAuthMiddleware);
jest.mock('../services/auditLogger', () => mockAuditMiddleware);

const billingRoutes = require('./billing.routes');

describe('billing.routes', () => {
  let app;

  beforeAll(() => {
    // Audit middleware should be called during module load for all endpoints
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith(
      'user.billing.checkout_session.create',
      { entityType: 'StripeCheckoutSession' }
    );
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith(
      'user.billing.portal_session.create',
      { entityType: 'StripePortalSession' }
    );
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith(
      'user.billing.subscription.reconcile',
      { entityType: 'Subscription' }
    );
  });

  beforeEach(() => {
    // Reset controller mocks
    Object.values(mockBillingController).forEach(mock => mock.mockClear());
    mockAuthMiddleware.authenticate.mockClear();

    // Create express app
    app = express();
    app.use(express.json());
    app.use('/billing', billingRoutes);
  });

  describe('POST /create-checkout-session', () => {
    it('should apply authenticate and audit middleware', async () => {
      mockBillingController.createCheckoutSession.mockImplementation((req, res) => {
        expect(req.user).toEqual({ id: 'test-user-id', email: 'test@example.com' });
        expect(req.auditAction).toBe('user.billing.checkout_session.create');
        expect(req.auditOptions).toEqual({ entityType: 'StripeCheckoutSession' });
        res.json({ sessionId: 'cs_test_123' });
      });

      await request(app)
        .post('/billing/create-checkout-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ priceId: 'price_123' })
        .expect(200);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });

    it('should call billingController.createCheckoutSession', async () => {
      mockBillingController.createCheckoutSession.mockImplementation((req, res) => {
        res.json({ sessionId: 'cs_test_123', url: 'https://checkout.stripe.com/cs_test_123' });
      });

      await request(app)
        .post('/billing/create-checkout-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ priceId: 'price_monthly' })
        .expect(200);

      expect(mockBillingController.createCheckoutSession).toHaveBeenCalledTimes(1);
    });

    it('should handle successful checkout session creation', async () => {
      const mockResponse = {
        sessionId: 'cs_test_456',
        url: 'https://checkout.stripe.com/cs_test_456'
      };
      mockBillingController.createCheckoutSession.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .post('/billing/create-checkout-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ priceId: 'price_annual' })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle checkout session errors', async () => {
      const mockError = { error: 'Invalid price ID' };
      mockBillingController.createCheckoutSession.mockImplementation((req, res) => {
        res.status(400).json(mockError);
      });

      const response = await request(app)
        .post('/billing/create-checkout-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ priceId: 'invalid_price' })
        .expect(400);

      expect(response.body).toEqual(mockError);
    });
  });

  describe('POST /create-portal-session', () => {
    it('should apply authenticate and audit middleware', async () => {
      mockBillingController.createPortalSession.mockImplementation((req, res) => {
        expect(req.user).toEqual({ id: 'test-user-id', email: 'test@example.com' });
        expect(req.auditAction).toBe('user.billing.portal_session.create');
        expect(req.auditOptions).toEqual({ entityType: 'StripePortalSession' });
        res.json({ url: 'https://billing.stripe.com/session_123' });
      });

      await request(app)
        .post('/billing/create-portal-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ returnUrl: 'https://example.com/dashboard' })
        .expect(200);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });

    it('should call billingController.createPortalSession', async () => {
      mockBillingController.createPortalSession.mockImplementation((req, res) => {
        res.json({ url: 'https://billing.stripe.com/portal_test' });
      });

      await request(app)
        .post('/billing/create-portal-session')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(200);

      expect(mockBillingController.createPortalSession).toHaveBeenCalledTimes(1);
    });

    it('should handle successful portal session creation', async () => {
      const mockResponse = { url: 'https://billing.stripe.com/portal_456' };
      mockBillingController.createPortalSession.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .post('/billing/create-portal-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ returnUrl: 'https://example.com/settings' })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle portal session errors', async () => {
      const mockError = { error: 'No active subscription found' };
      mockBillingController.createPortalSession.mockImplementation((req, res) => {
        res.status(400).json(mockError);
      });

      const response = await request(app)
        .post('/billing/create-portal-session')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(400);

      expect(response.body).toEqual(mockError);
    });
  });

  describe('POST /reconcile-subscription', () => {
    it('should apply authenticate and audit middleware', async () => {
      mockBillingController.reconcileSubscription.mockImplementation((req, res) => {
        expect(req.user).toEqual({ id: 'test-user-id', email: 'test@example.com' });
        expect(req.auditAction).toBe('user.billing.subscription.reconcile');
        expect(req.auditOptions).toEqual({ entityType: 'Subscription' });
        res.json({ success: true });
      });

      await request(app)
        .post('/billing/reconcile-subscription')
        .set('Authorization', 'Bearer valid-token')
        .send({ subscriptionId: 'sub_test_123' })
        .expect(200);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });

    it('should call billingController.reconcileSubscription', async () => {
      mockBillingController.reconcileSubscription.mockImplementation((req, res) => {
        res.json({ success: true, subscription: { id: 'sub_123' } });
      });

      await request(app)
        .post('/billing/reconcile-subscription')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(200);

      expect(mockBillingController.reconcileSubscription).toHaveBeenCalledTimes(1);
    });

    it('should handle successful subscription reconciliation', async () => {
      const mockResponse = {
        success: true,
        subscription: { id: 'sub_456', status: 'active' }
      };
      mockBillingController.reconcileSubscription.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .post('/billing/reconcile-subscription')
        .set('Authorization', 'Bearer valid-token')
        .send({ forceSync: true })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle reconciliation errors', async () => {
      const mockError = { error: 'Subscription not found in Stripe' };
      mockBillingController.reconcileSubscription.mockImplementation((req, res) => {
        res.status(404).json(mockError);
      });

      const response = await request(app)
        .post('/billing/reconcile-subscription')
        .set('Authorization', 'Bearer valid-token')
        .send({ subscriptionId: 'nonexistent' })
        .expect(404);

      expect(response.body).toEqual(mockError);
    });
  });

  describe('Route Integration', () => {
    it('should apply authentication to all billing endpoints', async () => {
      mockBillingController.createCheckoutSession.mockImplementation((req, res) => res.json({}));
      mockBillingController.createPortalSession.mockImplementation((req, res) => res.json({}));
      mockBillingController.reconcileSubscription.mockImplementation((req, res) => res.json({}));

      await request(app).post('/billing/create-checkout-session').send({}).expect(200);
      await request(app).post('/billing/create-portal-session').send({}).expect(200);
      await request(app).post('/billing/reconcile-subscription').send({}).expect(200);

      // All 3 endpoints should have called authenticate middleware
      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(3);
    });

    it('should apply audit middleware to all billing endpoints', async () => {
      mockBillingController.createCheckoutSession.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('user.billing.checkout_session.create');
        res.json({});
      });
      mockBillingController.createPortalSession.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('user.billing.portal_session.create');
        res.json({});
      });
      mockBillingController.reconcileSubscription.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('user.billing.subscription.reconcile');
        res.json({});
      });

      await request(app).post('/billing/create-checkout-session').send({}).expect(200);
      await request(app).post('/billing/create-portal-session').send({}).expect(200);
      await request(app).post('/billing/reconcile-subscription').send({}).expect(200);

      // All 3 endpoints should have audit middleware applied
      expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledTimes(3);
    });
  });
});