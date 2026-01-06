const Webhook = require('../models/Webhook');
const webhookService = require('../services/webhook.service');

const webhookController = {
  /**
   * Get all webhooks for the current organization
   */
  async getAll(req, res) {
    try {
      const organizationId = req.orgId || req.currentOrganization?._id || req.org?._id;
      
      // If superadmin (Basic Auth), allow fetching all webhooks if no org context
      const isBasicAuth = req.headers.authorization?.startsWith('Basic ');
      
      const query = {};
      if (organizationId) {
        query.organizationId = organizationId;
      } else if (!isBasicAuth) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const webhooks = await Webhook.find(query);
      res.json(webhooks);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * Create a new webhook
   */
  async create(req, res) {
    try {
      const organizationId = req.orgId || req.currentOrganization?._id || req.org?._id || req.body.organizationId;
      const { targetUrl, events, metadata } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      if (!targetUrl || !events || !Array.isArray(events)) {
        return res.status(400).json({ error: 'targetUrl and events (array) are required' });
      }

      const webhook = new Webhook({
        targetUrl,
        events,
        organizationId,
        metadata: metadata || {}
      });

      await webhook.save();
      res.status(201).json(webhook);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * Delete a webhook
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.orgId || req.currentOrganization?._id || req.org?._id;
      const isBasicAuth = req.headers.authorization?.startsWith('Basic ');

      const query = { _id: id };
      if (!isBasicAuth && organizationId) {
        query.organizationId = organizationId;
      }

      const result = await Webhook.deleteOne(query);
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Webhook not found' });
      }

      res.json({ message: 'Webhook deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * Test a webhook delivery
   */
  async test(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.orgId || req.currentOrganization?._id || req.org?._id;
      const isBasicAuth = req.headers.authorization?.startsWith('Basic ');

      const query = { _id: id };
      if (!isBasicAuth && organizationId) {
        query.organizationId = organizationId;
      }

      const webhook = await Webhook.findOne(query);
      if (!webhook) {
        return res.status(404).json({ error: 'Webhook not found' });
      }

      await webhookService.test(id);
      res.json({ message: 'Test payload dispatched' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = webhookController;
