const crypto = require('crypto');
const axios = require('axios');
const Webhook = require('../models/Webhook');

class WebhookService {
  /**
   * Emit an event to all subscribed webhooks for an organization
   * @param {string} event - Event name (e.g., 'form.submitted')
   * @param {Object} data - Payload data
   * @param {string} organizationId - Organization ID
   */
  async emit(event, data, organizationId) {
    try {
      const webhooks = await Webhook.find({
        organizationId,
        events: event,
        status: 'active'
      });

      if (!webhooks || webhooks.length === 0) return;

      const payload = {
        event,
        timestamp: new Date().toISOString(),
        organizationId,
        data
      };

      const promises = webhooks.map(webhook => this.deliver(webhook, payload));
      // Non-blocking execution
      Promise.all(promises).catch(err => {
        console.error('Error delivering some webhooks:', err);
      });

    } catch (error) {
      console.error('WebhookService.emit error:', error);
    }
  }

  /**
   * Deliver payload to a specific webhook
   * @param {Object} webhook - Webhook model instance
   * @param {Object} payload - Payload object
   */
  async deliver(webhook, payload) {
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const timeout = webhook.timeout || 5000;
    const isAsync = webhook.isAsync || false;

    if (isAsync) {
      // Fire and forget
      axios.post(webhook.targetUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-SaaS-Signature': signature,
          'User-Agent': 'SuperBackend-Webhook/1.0'
        },
        timeout: timeout
      }).catch(err => {
        console.error(`Async webhook delivery to ${webhook.targetUrl} failed:`, err.message);
      });

      // Log success immediately for async
      const AuditEvent = require('../models/AuditEvent');
      await AuditEvent.create({
        actorType: 'system',
        actorId: 'webhook-service',
        action: 'WEBHOOK_DELIVERY_ASYNC_DISPATCHED',
        entityType: 'Webhook',
        entityId: webhook._id,
        meta: {
          event: payload.event,
          targetUrl: webhook.targetUrl,
          mode: 'async',
          payload
        }
      });
      return;
    }

    try {
      await axios.post(webhook.targetUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-SaaS-Signature': signature,
          'User-Agent': 'SuperBackend-Webhook/1.0'
        },
        timeout: timeout
      });
      
      // Reset status if it was previously failed/paused and now succeeds
      if (webhook.status === 'failed') {
        webhook.status = 'active';
        await webhook.save();
      }

      // Log success to audit
      const AuditEvent = require('../models/AuditEvent');
      await AuditEvent.create({
        actorType: 'system',
        actorId: 'webhook-service',
        action: 'WEBHOOK_DELIVERY_SUCCESS',
        entityType: 'Webhook',
        entityId: webhook._id,
        meta: {
          event: payload.event,
          targetUrl: webhook.targetUrl,
          statusCode: 200,
          payload
        }
      });
    } catch (error) {
      console.error(`Failed to deliver webhook to ${webhook.targetUrl}:`, error.message);
      
      // Log failure to audit
      const AuditEvent = require('../models/AuditEvent');
      await AuditEvent.create({
        actorType: 'system',
        actorId: 'webhook-service',
        action: 'WEBHOOK_DELIVERY_FAILURE',
        entityType: 'Webhook',
        entityId: webhook._id,
        meta: {
          event: payload.event,
          targetUrl: webhook.targetUrl,
          error: error.message,
          statusCode: error.response?.status,
          payload
        }
      });
    }
  }

  /**
   * Send a test ping to a webhook
   * @param {string} webhookId - Webhook ID
   */
  async test(webhookId) {
    const webhook = await Webhook.findById(webhookId);
    if (!webhook) throw new Error('Webhook not found');

    const payload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      organizationId: webhook.organizationId,
      data: { message: 'This is a test delivery' }
    };

    return this.deliver(webhook, payload);
  }
}

module.exports = new WebhookService();
