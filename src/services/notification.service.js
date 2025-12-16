const Notification = require('../models/Notification');
const User = require('../models/User');
const emailService = require('./email.service');
const crypto = require('crypto');

async function createNotification({
  userId,
  type,
  title,
  message,
  channel = 'in_app',
  metadata = {},
  sentByAdminId = null,
  broadcastId = null,
}) {
  const notification = await Notification.create({
    userId,
    type,
    title,
    message,
    channel,
    metadata,
    sentByAdminId,
    broadcastId,
    read: false,
    emailStatus: channel === 'in_app' ? 'skipped' : 'pending',
  });

  return notification;
}

async function sendEmailForNotification(notification, userEmail) {
  if (!notification || !userEmail) return notification;

  if (notification.channel === 'in_app') {
    return notification;
  }

  try {
    const typeColors = {
      info: '#3B82F6',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
    };

    const color = typeColors[notification.type] || '#6B7280';

    await emailService.sendEmail({
      to: userEmail,
      subject: notification.title,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="border-left: 4px solid ${color}; padding-left: 16px; margin: 20px 0;">
            <h2 style="margin: 0 0 10px 0; color: #1F2937;">${escapeHtml(notification.title)}</h2>
            <p style="margin: 0; color: #4B5563; line-height: 1.6;">${escapeHtml(notification.message)}</p>
          </div>
          <p style="color: #9CA3AF; font-size: 12px; margin-top: 30px;">
            This is an automated notification from your account.
          </p>
        </div>
      `,
      type: 'notification',
      metadata: {
        notificationId: notification._id.toString(),
        notificationType: notification.type,
      },
    });

    notification.emailStatus = 'sent';
    notification.emailSentAt = new Date();
    await notification.save();
  } catch (error) {
    console.error('Failed to send notification email:', error);
    notification.emailStatus = 'failed';
    await notification.save();
  }

  return notification;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendToUser({
  userId,
  type,
  title,
  message,
  channel = 'in_app',
  metadata = {},
  sentByAdminId = null,
}) {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new Error('User not found');
  }

  const notification = await createNotification({
    userId,
    type,
    title,
    message,
    channel,
    metadata,
    sentByAdminId,
  });

  if (channel === 'email' || channel === 'both') {
    await sendEmailForNotification(notification, user.email);
  }

  return notification;
}

async function sendToUsers({
  userIds,
  type,
  title,
  message,
  channel = 'in_app',
  metadata = {},
  sentByAdminId = null,
}) {
  const broadcastId = crypto.randomBytes(12).toString('hex');
  const results = [];

  for (const userId of userIds) {
    try {
      const user = await User.findById(userId).lean();
      if (!user) continue;

      const notification = await createNotification({
        userId,
        type,
        title,
        message,
        channel,
        metadata,
        sentByAdminId,
        broadcastId,
      });

      if (channel === 'email' || channel === 'both') {
        await sendEmailForNotification(notification, user.email);
      }

      results.push({ userId, success: true, notificationId: notification._id });
    } catch (error) {
      console.error(`Failed to send notification to user ${userId}:`, error);
      results.push({ userId, success: false, error: error.message });
    }
  }

  return { broadcastId, results };
}

async function broadcast({
  type,
  title,
  message,
  channel = 'in_app',
  metadata = {},
  sentByAdminId = null,
  userFilter = {},
}) {
  const users = await User.find(userFilter).select('_id email').lean();
  const userIds = users.map((u) => u._id);

  return sendToUsers({
    userIds,
    type,
    title,
    message,
    channel,
    metadata,
    sentByAdminId,
  });
}

async function getNotificationStats() {
  const [totalCount, unreadCount, emailPendingCount, emailSentCount, emailFailedCount] = await Promise.all([
    Notification.countDocuments({}),
    Notification.countDocuments({ read: false }),
    Notification.countDocuments({ emailStatus: 'pending' }),
    Notification.countDocuments({ emailStatus: 'sent' }),
    Notification.countDocuments({ emailStatus: 'failed' }),
  ]);

  return {
    total: totalCount,
    unread: unreadCount,
    emailPending: emailPendingCount,
    emailSent: emailSentCount,
    emailFailed: emailFailedCount,
  };
}

module.exports = {
  createNotification,
  sendEmailForNotification,
  sendToUser,
  sendToUsers,
  broadcast,
  getNotificationStats,
};
