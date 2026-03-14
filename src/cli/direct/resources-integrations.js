#!/usr/bin/env node

/**
 * Integration resources: telegram, webhooks, stripe-items, stripe-events, external-dbs
 */

const mongoose = require('mongoose');

const telegram = {
  async execute(options) {
    const TelegramBot = mongoose.model('TelegramBot');
    switch (options.command) {
      case 'list': {
        const bots = await TelegramBot.find().lean();
        return { items: bots, count: bots.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Bot ID is required');
        const bot = await TelegramBot.findById(options.id).lean();
        if (!bot) throw new Error('Bot not found');
        return bot;
      }
      case 'create': {
        if (!options.name) throw new Error('--name is required');
        if (!options.key) throw new Error('--key (bot token) is required');
        const bot = await TelegramBot.create({ name: options.name, token: options.key, enabled: true });
        return bot;
      }
      case 'delete': {
        if (!options.id) throw new Error('Bot ID is required');
        const bot = await TelegramBot.findByIdAndDelete(options.id);
        if (!bot) throw new Error('Bot not found');
        return { success: true, id: options.id };
      }
      case 'enable': {
        if (!options.id) throw new Error('Bot ID is required');
        const bot = await TelegramBot.findByIdAndUpdate(options.id, { enabled: true }, { new: true });
        if (!bot) throw new Error('Bot not found');
        return bot;
      }
      case 'disable': {
        if (!options.id) throw new Error('Bot ID is required');
        const bot = await TelegramBot.findByIdAndUpdate(options.id, { enabled: false }, { new: true });
        if (!bot) throw new Error('Bot not found');
        return bot;
      }
      default:
        throw new Error(`Unknown telegram command: ${options.command}`);
    }
  },
};

const webhooks = {
  async execute(options) {
    const Webhook = mongoose.model('Webhook');
    switch (options.command) {
      case 'list': {
        const webhooks = await Webhook.find().lean();
        return { items: webhooks, count: webhooks.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Webhook ID is required');
        const webhook = await Webhook.findById(options.id).lean();
        if (!webhook) throw new Error('Webhook not found');
        return webhook;
      }
      case 'create': {
        if (!options.name) throw new Error('--name is required');
        if (!options.key) throw new Error('--key (URL) is required');
        const webhook = await Webhook.create({ name: options.name, url: options.key, enabled: true });
        return webhook;
      }
      case 'delete': {
        if (!options.id) throw new Error('Webhook ID is required');
        const webhook = await Webhook.findByIdAndDelete(options.id);
        if (!webhook) throw new Error('Webhook not found');
        return { success: true, id: options.id };
      }
      case 'enable': {
        if (!options.id) throw new Error('Webhook ID is required');
        const webhook = await Webhook.findByIdAndUpdate(options.id, { enabled: true }, { new: true });
        if (!webhook) throw new Error('Webhook not found');
        return webhook;
      }
      case 'disable': {
        if (!options.id) throw new Error('Webhook ID is required');
        const webhook = await Webhook.findByIdAndUpdate(options.id, { enabled: false }, { new: true });
        if (!webhook) throw new Error('Webhook not found');
        return webhook;
      }
      default:
        throw new Error(`Unknown webhooks command: ${options.command}`);
    }
  },
};

const stripeItems = {
  async execute(options) {
    const StripeCatalogItem = mongoose.model('StripeCatalogItem');
    switch (options.command) {
      case 'list': {
        const items = await StripeCatalogItem.find().lean();
        return { items, count: items.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Stripe item ID is required');
        const item = await StripeCatalogItem.findById(options.id).lean();
        if (!item) throw new Error('Stripe item not found');
        return item;
      }
      case 'clear': {
        const result = await StripeCatalogItem.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown stripe-items command: ${options.command}`);
    }
  },
};

const stripeEvents = {
  async execute(options) {
    const StripeWebhookEvent = mongoose.model('StripeWebhookEvent');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const events = await StripeWebhookEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: events, count: events.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Stripe event ID is required');
        const event = await StripeWebhookEvent.findById(options.id).lean();
        if (!event) throw new Error('Stripe event not found');
        return event;
      }
      case 'clear': {
        const result = await StripeWebhookEvent.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown stripe-events command: ${options.command}`);
    }
  },
};

const externalDbs = {
  async execute(options) {
    const ExternalDbConnection = mongoose.model('ExternalDbConnection');
    switch (options.command) {
      case 'list': {
        const connections = await ExternalDbConnection.find().lean();
        return { items: connections, count: connections.length };
      }
      case 'get': {
        if (!options.id) throw new Error('External DB connection ID is required');
        const connection = await ExternalDbConnection.findById(options.id).lean();
        if (!connection) throw new Error('External DB connection not found');
        return connection;
      }
      case 'create': {
        if (!options.name) throw new Error('--name is required');
        if (!options.key) throw new Error('--key (connection string) is required');
        const connection = await ExternalDbConnection.create({
          name: options.name,
          connectionString: options.key,
          type: options.description || 'mongodb',
        });
        return connection;
      }
      case 'delete': {
        if (!options.id) throw new Error('External DB connection ID is required');
        const connection = await ExternalDbConnection.findByIdAndDelete(options.id);
        if (!connection) throw new Error('External DB connection not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown external-dbs command: ${options.command}`);
    }
  },
};

module.exports = { telegram, webhooks, stripeItems, stripeEvents, externalDbs };
