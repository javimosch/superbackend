jest.mock('axios');
jest.mock('../models/Webhook', () => ({
  find: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../models/AuditEvent', () => ({
  create: jest.fn()
}));

const axios = require('axios');
const Webhook = require('../models/Webhook');
const AuditEvent = require('../models/AuditEvent');
const webhookService = require('./webhook.service');

describe('webhook.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('emit', () => {
    test('does nothing when no webhooks found', async () => {
      Webhook.find.mockResolvedValue([]);

      await webhookService.emit('test.event', { foo: 'bar' }, 'org123');

      expect(Webhook.find).toHaveBeenCalledWith({
        organizationId: 'org123',
        events: 'test.event',
        status: 'active'
      });
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('delivers to multiple webhooks', async () => {
      const webhooks = [
        { _id: 'w1', targetUrl: 'https://example.com/webhook1', secret: 'secret1', timeout: 5000, isAsync: false },
        { _id: 'w2', targetUrl: 'https://example.com/webhook2', secret: 'secret2', timeout: 3000, isAsync: false }
      ];
      Webhook.find.mockResolvedValue(webhooks);
      axios.post.mockResolvedValue({ status: 200 });
      AuditEvent.create.mockResolvedValue({});

      await webhookService.emit('test.event', { foo: 'bar' }, 'org123');

      expect(axios.post).toHaveBeenCalledTimes(2);
      expect(AuditEvent.create).toHaveBeenCalledTimes(2);
    });

    test('handles errors gracefully', async () => {
      Webhook.find.mockRejectedValue(new Error('DB error'));

      await expect(webhookService.emit('test.event', {}, 'org123')).resolves.toBeUndefined();
    });
  });

  describe('deliver', () => {
    test('delivers synchronous webhook successfully', async () => {
      const webhook = {
        _id: 'w1',
        targetUrl: 'https://example.com/webhook',
        secret: 'secret',
        timeout: 5000,
        isAsync: false,
        status: 'active',
        save: jest.fn().mockResolvedValue()
      };
      const payload = { event: 'test', timestamp: '2024-01-01T00:00:00.000Z', organizationId: 'org123', data: {} };
      
      axios.post.mockResolvedValue({ status: 200 });
      AuditEvent.create.mockResolvedValue({});

      await webhookService.deliver(webhook, payload);

      expect(axios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-SaaS-Signature': expect.any(String),
            'User-Agent': 'SuperBackend-Webhook/1.0'
          }),
          timeout: 5000
        })
      );
      expect(AuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WEBHOOK_DELIVERY_SUCCESS'
        })
      );
    });

    test('delivers async webhook without waiting', async () => {
      const webhook = {
        _id: 'w1',
        targetUrl: 'https://example.com/webhook',
        secret: 'secret',
        timeout: 5000,
        isAsync: true
      };
      const payload = { event: 'test', timestamp: '2024-01-01T00:00:00.000Z', organizationId: 'org123', data: {} };
      
      axios.post.mockResolvedValue({ status: 200 });
      AuditEvent.create.mockResolvedValue({});

      await webhookService.deliver(webhook, payload);

      expect(AuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WEBHOOK_DELIVERY_ASYNC_DISPATCHED'
        })
      );
    });

    test('handles delivery failure', async () => {
      const webhook = {
        _id: 'w1',
        targetUrl: 'https://example.com/webhook',
        secret: 'secret',
        timeout: 5000,
        isAsync: false,
        status: 'active'
      };
      const payload = { event: 'test', timestamp: '2024-01-01T00:00:00.000Z', organizationId: 'org123', data: {} };
      
      const error = new Error('Network error');
      error.response = { status: 500 };
      axios.post.mockRejectedValue(error);
      AuditEvent.create.mockResolvedValue({});

      await webhookService.deliver(webhook, payload);

      expect(AuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WEBHOOK_DELIVERY_FAILURE',
          meta: expect.objectContaining({
            error: 'Network error',
            statusCode: 500
          })
        })
      );
    });

    test('resets failed webhook status on success', async () => {
      const webhook = {
        _id: 'w1',
        targetUrl: 'https://example.com/webhook',
        secret: 'secret',
        timeout: 5000,
        isAsync: false,
        status: 'failed',
        save: jest.fn().mockResolvedValue()
      };
      const payload = { event: 'test', timestamp: '2024-01-01T00:00:00.000Z', organizationId: 'org123', data: {} };
      
      axios.post.mockResolvedValue({ status: 200 });
      AuditEvent.create.mockResolvedValue({});

      await webhookService.deliver(webhook, payload);

      expect(webhook.status).toBe('active');
      expect(webhook.save).toHaveBeenCalled();
    });
  });

  describe('test', () => {
    test('throws error when webhook not found', async () => {
      Webhook.findById.mockResolvedValue(null);

      await expect(webhookService.test('invalid-id')).rejects.toThrow('Webhook not found');
    });

    test('delivers test payload to webhook', async () => {
      const webhook = {
        _id: 'w1',
        targetUrl: 'https://example.com/webhook',
        secret: 'secret',
        timeout: 5000,
        isAsync: false,
        status: 'active',
        organizationId: 'org123'
      };
      
      Webhook.findById.mockResolvedValue(webhook);
      axios.post.mockResolvedValue({ status: 200 });
      AuditEvent.create.mockResolvedValue({});

      await webhookService.test('w1');

      expect(axios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          event: 'webhook.test',
          data: { message: 'This is a test delivery' }
        }),
        expect.any(Object)
      );
    });
  });
});
