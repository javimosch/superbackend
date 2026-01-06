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

    try {
      await axios.post(webhook.targetUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-SaaS-Signature': signature,
          'User-Agent': 'SaaSBackend-Webhook/1.0'
        },
        timeout: 5000 // 5 second timeout
      });
      
      // Reset status if it was previously failed/paused and now succeeds
      if (webhook.status === 'failed') {
        webhook.status = 'active';
        await webhook.save();
      }
    } catch (error) {
      console.error(`Failed to deliver webhook to ${webhook.targetUrl}:`, error.message);
      // Logic for tracking failures could be added here
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
