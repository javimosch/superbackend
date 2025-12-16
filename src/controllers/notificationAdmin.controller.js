const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const notificationService = require('../services/notification.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function parseLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function parseOffset(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

exports.listNotifications = async (req, res) => {
  try {
    const { userId, type, channel, emailStatus, broadcastId, limit, offset } = req.query;

    const parsedLimit = parseLimit(limit);
    const parsedOffset = parseOffset(offset);

    const query = {};

    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
      query.userId = new mongoose.Types.ObjectId(String(userId));
    }

    if (type) {
      query.type = String(type);
    }

    if (channel) {
      query.channel = String(channel);
    }

    if (emailStatus) {
      query.emailStatus = String(emailStatus);
    }

    if (broadcastId) {
      query.broadcastId = String(broadcastId);
    }

    const notifications = await Notification.find(query)
      .populate('userId', 'email name')
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .skip(parsedOffset)
      .lean();

    const total = await Notification.countDocuments(query);

    return res.json({
      notifications,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    });
  } catch (error) {
    console.error('Admin notification list error:', error);
    return res.status(500).json({ error: 'Failed to list notifications' });
  }
};

exports.getNotificationStats = async (req, res) => {
  try {
    const stats = await notificationService.getNotificationStats();
    return res.json(stats);
  } catch (error) {
    console.error('Admin notification stats error:', error);
    return res.status(500).json({ error: 'Failed to get notification stats' });
  }
};

exports.sendNotification = async (req, res) => {
  try {
    const { userIds, type, title, message, channel = 'in_app', metadata = {} } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({ error: 'type, title, and message are required' });
    }

    if (!['info', 'success', 'warning', 'error'].includes(String(type))) {
      return res.status(400).json({ error: 'Invalid type. Must be info, success, warning, or error.' });
    }

    if (!['in_app', 'email', 'both'].includes(String(channel))) {
      return res.status(400).json({ error: 'Invalid channel. Must be in_app, email, or both.' });
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }

    const validUserIds = userIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    if (validUserIds.length === 0) {
      return res.status(400).json({ error: 'No valid user IDs provided' });
    }

    const actor = getBasicAuthActor(req);

    const result = await notificationService.sendToUsers({
      userIds: validUserIds,
      type: String(type),
      title: String(title),
      message: String(message),
      channel: String(channel),
      metadata,
      sentByAdminId: actor.actorId,
    });

    await createAuditEvent({
      ...actor,
      action: 'admin.notification.send',
      entityType: 'Notification',
      entityId: result.broadcastId,
      before: null,
      after: { userCount: validUserIds.length, type, title, channel },
      meta: { broadcastId: result.broadcastId },
    });

    return res.status(201).json({
      message: 'Notifications sent',
      broadcastId: result.broadcastId,
      results: result.results,
    });
  } catch (error) {
    console.error('Admin send notification error:', error);
    return res.status(500).json({ error: 'Failed to send notifications' });
  }
};

exports.broadcastNotification = async (req, res) => {
  try {
    const { type, title, message, channel = 'in_app', metadata = {} } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({ error: 'type, title, and message are required' });
    }

    if (!['info', 'success', 'warning', 'error'].includes(String(type))) {
      return res.status(400).json({ error: 'Invalid type. Must be info, success, warning, or error.' });
    }

    if (!['in_app', 'email', 'both'].includes(String(channel))) {
      return res.status(400).json({ error: 'Invalid channel. Must be in_app, email, or both.' });
    }

    const actor = getBasicAuthActor(req);

    const result = await notificationService.broadcast({
      type: String(type),
      title: String(title),
      message: String(message),
      channel: String(channel),
      metadata,
      sentByAdminId: actor.actorId,
      userFilter: { disabled: { $ne: true } },
    });

    await createAuditEvent({
      ...actor,
      action: 'admin.notification.broadcast',
      entityType: 'Notification',
      entityId: result.broadcastId,
      before: null,
      after: { userCount: result.results.length, type, title, channel },
      meta: { broadcastId: result.broadcastId },
    });

    return res.status(201).json({
      message: 'Broadcast sent',
      broadcastId: result.broadcastId,
      recipientCount: result.results.length,
      successCount: result.results.filter((r) => r.success).length,
      failCount: result.results.filter((r) => !r.success).length,
    });
  } catch (error) {
    console.error('Admin broadcast notification error:', error);
    return res.status(500).json({ error: 'Failed to broadcast notification' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const before = notification.toObject();
    const actor = getBasicAuthActor(req);

    await Notification.deleteOne({ _id: id });

    await createAuditEvent({
      ...actor,
      action: 'admin.notification.delete',
      entityType: 'Notification',
      entityId: String(id),
      before,
      after: null,
      meta: null,
    });

    return res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Admin notification delete error:', error);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
};

exports.retryEmailNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const notification = await Notification.findById(id).populate('userId', 'email');
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.channel === 'in_app') {
      return res.status(400).json({ error: 'This notification is in-app only' });
    }

    if (notification.emailStatus === 'sent') {
      return res.status(400).json({ error: 'Email already sent' });
    }

    const userEmail = notification.userId?.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found' });
    }

    await notificationService.sendEmailForNotification(notification, userEmail);

    return res.json({
      message: 'Email retry attempted',
      emailStatus: notification.emailStatus,
    });
  } catch (error) {
    console.error('Admin notification retry error:', error);
    return res.status(500).json({ error: 'Failed to retry email notification' });
  }
};
