const { retryFailedWebhooks, processWebhookEvent } = require('./webhookRetry');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const stripeService = require('../services/stripe.service');

// Mock dependencies
jest.mock('../models/StripeWebhookEvent');
jest.mock('../services/stripe.service');

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('WebhookRetry Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('retryFailedWebhooks', () => {
    test('should retry failed webhooks successfully', async () => {
      const mockEvents = [
        {
          stripeEventId: 'evt_123',
          eventType: 'checkout.session.completed',
          data: { id: 'cs_123' },
          status: 'failed',
          retryCount: 1,
          processingErrors: [],
          save: jest.fn().mockResolvedValue()
        },
        {
          stripeEventId: 'evt_456',
          eventType: 'customer.subscription.created',
          data: { id: 'sub_456' },
          status: 'failed',
          retryCount: 0,
          processingErrors: [],
          save: jest.fn().mockResolvedValue()
        }
      ];

      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockEvents)
        })
      });

      stripeService.handleCheckoutSessionCompleted.mockResolvedValue();
      stripeService.handleSubscriptionCreated.mockResolvedValue();

      const result = await retryFailedWebhooks();

      expect(result).toEqual({
        total: 2,
        succeeded: 2,
        failed: 0,
        errors: []
      });

      expect(mockEvents[0].status).toBe('processed');
      expect(mockEvents[1].status).toBe('processed');
      expect(mockEvents[0].save).toHaveBeenCalled();
      expect(mockEvents[1].save).toHaveBeenCalled();
    });

    test('should handle retry failures and increment retry count', async () => {
      const mockEvent = {
        stripeEventId: 'evt_789',
        eventType: 'invoice.payment_failed',
        data: { id: 'in_789' },
        status: 'failed',
        retryCount: 1,
        processingErrors: [],
        save: jest.fn().mockResolvedValue()
      };

      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockEvent])
        })
      });

      const testError = new Error('Processing failed');
      stripeService.handleInvoicePaymentFailed.mockRejectedValue(testError);

      const result = await retryFailedWebhooks();

      expect(result).toEqual({
        total: 1,
        succeeded: 0,
        failed: 1,
        errors: [
          {
            eventId: 'evt_789',
            error: 'Processing failed'
          }
        ]
      });

      expect(mockEvent.retryCount).toBe(2);
      expect(mockEvent.processingErrors).toHaveLength(1);
      expect(mockEvent.processingErrors[0].message).toBe('Processing failed');
      expect(mockEvent.save).toHaveBeenCalled();
    });

    test('should handle max retries reached', async () => {
      const mockEvent = {
        stripeEventId: 'evt_max',
        eventType: 'customer.subscription.updated',
        data: { id: 'sub_max' },
        status: 'failed',
        retryCount: 2,
        processingErrors: [],
        save: jest.fn().mockResolvedValue()
      };

      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockEvent])
        })
      });

      const testError = new Error('Max retries test');
      stripeService.handleSubscriptionUpdated.mockRejectedValue(testError);

      const result = await retryFailedWebhooks({ maxRetries: 3 });

      expect(mockEvent.retryCount).toBe(3);
      expect(mockConsoleError).toHaveBeenCalledWith('Max retries reached for event evt_max');
    });

    test('should respect custom options', async () => {
      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([])
        })
      });

      await retryFailedWebhooks({ limit: 5, maxRetries: 2 });

      expect(StripeWebhookEvent.find).toHaveBeenCalledWith({
        status: 'failed',
        retryCount: { $lt: 2 }
      });
    });

    test('should use default options when not provided', async () => {
      StripeWebhookEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([])
        })
      });

      await retryFailedWebhooks();

      expect(StripeWebhookEvent.find).toHaveBeenCalledWith({
        status: 'failed',
        retryCount: { $lt: 3 }
      });
    });
  });

  describe('processWebhookEvent', () => {
    test('should handle checkout.session.completed event', async () => {
      const webhookEvent = {
        eventType: 'checkout.session.completed',
        data: { id: 'cs_test' },
        previousAttributes: null
      };

      stripeService.handleCheckoutSessionCompleted.mockResolvedValue();

      await processWebhookEvent(webhookEvent);

      expect(stripeService.handleCheckoutSessionCompleted).toHaveBeenCalledWith({ id: 'cs_test' });
    });

    test('should handle customer.subscription.created event', async () => {
      const webhookEvent = {
        eventType: 'customer.subscription.created',
        data: { id: 'sub_test' },
        previousAttributes: null
      };

      stripeService.handleSubscriptionCreated.mockResolvedValue();

      await processWebhookEvent(webhookEvent);

      expect(stripeService.handleSubscriptionCreated).toHaveBeenCalledWith({ id: 'sub_test' });
    });

    test('should handle customer.subscription.updated event', async () => {
      const webhookEvent = {
        eventType: 'customer.subscription.updated',
        data: { id: 'sub_updated' },
        previousAttributes: { status: 'active' }
      };

      stripeService.handleSubscriptionUpdated.mockResolvedValue();

      await processWebhookEvent(webhookEvent);

      expect(stripeService.handleSubscriptionUpdated).toHaveBeenCalledWith(
        { id: 'sub_updated' },
        { status: 'active' }
      );
    });

    test('should handle customer.subscription.deleted event', async () => {
      const webhookEvent = {
        eventType: 'customer.subscription.deleted',
        data: { id: 'sub_deleted' },
        previousAttributes: null
      };

      stripeService.handleSubscriptionDeleted.mockResolvedValue();

      await processWebhookEvent(webhookEvent);

      expect(stripeService.handleSubscriptionDeleted).toHaveBeenCalledWith({ id: 'sub_deleted' });
    });

    test('should handle invoice.payment_succeeded event', async () => {
      const webhookEvent = {
        eventType: 'invoice.payment_succeeded',
        data: { id: 'in_success' },
        previousAttributes: null
      };

      stripeService.handleInvoicePaymentSucceeded.mockResolvedValue();

      await processWebhookEvent(webhookEvent);

      expect(stripeService.handleInvoicePaymentSucceeded).toHaveBeenCalledWith({ id: 'in_success' });
    });

    test('should handle invoice.payment_failed event', async () => {
      const webhookEvent = {
        eventType: 'invoice.payment_failed',
        data: { id: 'in_failed' },
        previousAttributes: null
      };

      stripeService.handleInvoicePaymentFailed.mockResolvedValue();

      await processWebhookEvent(webhookEvent);

      expect(stripeService.handleInvoicePaymentFailed).toHaveBeenCalledWith({ id: 'in_failed' });
    });

    test('should handle unhandled event types', async () => {
      const webhookEvent = {
        eventType: 'customer.created',
        data: { id: 'cus_test' },
        previousAttributes: null
      };

      await processWebhookEvent(webhookEvent);

      expect(mockConsoleLog).toHaveBeenCalledWith('Unhandled event type: customer.created');
    });

    test('should propagate errors from stripe service calls', async () => {
      const webhookEvent = {
        eventType: 'checkout.session.completed',
        data: { id: 'cs_error' },
        previousAttributes: null
      };

      const testError = new Error('Stripe service error');
      stripeService.handleCheckoutSessionCompleted.mockRejectedValue(testError);

      await expect(processWebhookEvent(webhookEvent)).rejects.toThrow('Stripe service error');
    });
  });
});