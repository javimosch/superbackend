#!/usr/bin/env node

/**
 * Log resources: notifications, cache, audit-logs, console-logs, activity-logs, email-logs
 */

const mongoose = require('mongoose');

const notifications = {
  async execute(options) {
    const Notification = mongoose.model('Notification');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const notifications = await Notification.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: notifications, count: notifications.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Notification ID is required');
        const notification = await Notification.findById(options.id).lean();
        if (!notification) throw new Error('Notification not found');
        return notification;
      }
      case 'delete': {
        if (!options.id) throw new Error('Notification ID is required');
        const notification = await Notification.findByIdAndDelete(options.id);
        if (!notification) throw new Error('Notification not found');
        return { success: true, id: options.id };
      }
      case 'clear': {
        await Notification.deleteMany({});
        return { success: true, message: 'All notifications cleared' };
      }
      default:
        throw new Error(`Unknown notifications command: ${options.command}`);
    }
  },
};

const cache = {
  async execute(options) {
    const CacheEntry = mongoose.model('CacheEntry');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const entries = await CacheEntry.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: entries, count: entries.length };
      }
      case 'get': {
        if (!options.key) throw new Error('--key is required');
        const entry = await CacheEntry.findOne({ key: options.key }).lean();
        if (!entry) throw new Error('Cache entry not found');
        return entry;
      }
      case 'delete': {
        if (!options.key) throw new Error('--key is required');
        const entry = await CacheEntry.findOneAndDelete({ key: options.key });
        if (!entry) throw new Error('Cache entry not found');
        return { success: true, key: options.key };
      }
      case 'clear': {
        const result = await CacheEntry.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown cache command: ${options.command}`);
    }
  },
};

const auditLogs = {
  async execute(options) {
    const AuditEvent = mongoose.model('AuditEvent');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const events = await AuditEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: events, count: events.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Audit event ID is required');
        const event = await AuditEvent.findById(options.id).lean();
        if (!event) throw new Error('Audit event not found');
        return event;
      }
      case 'clear': {
        const days = parseInt(options.value) || 90;
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await AuditEvent.deleteMany({ createdAt: { $lt: cutoffDate } });
        return { success: true, deletedCount: result.deletedCount, olderThan: cutoffDate.toISOString() };
      }
      default:
        throw new Error(`Unknown audit-logs command: ${options.command}`);
    }
  },
};

const consoleLogs = {
  async execute(options) {
    const ConsoleLog = mongoose.model('ConsoleLog');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const logs = await ConsoleLog.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: logs, count: logs.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Log ID is required');
        const log = await ConsoleLog.findById(options.id).lean();
        if (!log) throw new Error('Log not found');
        return log;
      }
      case 'clear': {
        const days = parseInt(options.value) || 7;
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await ConsoleLog.deleteMany({ createdAt: { $lt: cutoffDate } });
        return { success: true, deletedCount: result.deletedCount, olderThan: cutoffDate.toISOString() };
      }
      default:
        throw new Error(`Unknown console-logs command: ${options.command}`);
    }
  },
};

const activityLogs = {
  async execute(options) {
    const ActivityLog = mongoose.model('ActivityLog');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: logs, count: logs.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Activity log ID is required');
        const log = await ActivityLog.findById(options.id).lean();
        if (!log) throw new Error('Activity log not found');
        return log;
      }
      case 'clear': {
        const days = parseInt(options.value) || 30;
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await ActivityLog.deleteMany({ createdAt: { $lt: cutoffDate } });
        return { success: true, deletedCount: result.deletedCount, olderThan: cutoffDate.toISOString() };
      }
      default:
        throw new Error(`Unknown activity-logs command: ${options.command}`);
    }
  },
};

const emailLogs = {
  async execute(options) {
    const EmailLog = mongoose.model('EmailLog');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const logs = await EmailLog.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: logs, count: logs.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Email log ID is required');
        const log = await EmailLog.findById(options.id).lean();
        if (!log) throw new Error('Email log not found');
        return log;
      }
      case 'clear': {
        const days = parseInt(options.value) || 30;
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await EmailLog.deleteMany({ createdAt: { $lt: cutoffDate } });
        return { success: true, deletedCount: result.deletedCount, olderThan: cutoffDate.toISOString() };
      }
      default:
        throw new Error(`Unknown email-logs command: ${options.command}`);
    }
  },
};

const waitingList = {
  async execute(options) {
    const WaitingList = mongoose.model('WaitingList');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const entries = await WaitingList.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: entries, count: entries.length };
      }
      case 'delete': {
        if (!options.id) throw new Error('Waiting list entry ID is required');
        const entry = await WaitingList.findByIdAndDelete(options.id);
        if (!entry) throw new Error('Waiting list entry not found');
        return { success: true, id: options.id };
      }
      case 'clear': {
        await WaitingList.deleteMany({});
        return { success: true, message: 'All waiting list entries cleared' };
      }
      default:
        throw new Error(`Unknown waiting-list command: ${options.command}`);
    }
  },
};

module.exports = { notifications, cache, auditLogs, consoleLogs, activityLogs, emailLogs, waitingList };
