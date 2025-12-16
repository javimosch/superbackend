const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const OrganizationMember = require('../models/OrganizationMember');
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

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.listUsers = async (req, res) => {
  try {
    const { q, role, subscriptionStatus, currentPlan, disabled, limit, offset } = req.query;

    const parsedLimit = parseLimit(limit);
    const parsedOffset = parseOffset(offset);

    const query = {};

    if (q) {
      const pattern = escapeRegex(String(q).trim());
      query.$or = [
        { email: { $regex: pattern, $options: 'i' } },
        { name: { $regex: pattern, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = String(role);
    }

    if (subscriptionStatus) {
      query.subscriptionStatus = String(subscriptionStatus);
    }

    if (currentPlan) {
      query.currentPlan = String(currentPlan);
    }

    if (disabled === 'true') {
      query.disabled = true;
    } else if (disabled === 'false') {
      query.disabled = { $ne: true };
    }

    const users = await User.find(query)
      .select('-passwordHash -passwordResetToken -passwordResetExpiry')
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .skip(parsedOffset)
      .lean();

    const total = await User.countDocuments(query);

    return res.json({
      users,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    });
  } catch (error) {
    console.error('Admin user list error:', error);
    return res.status(500).json({ error: 'Failed to list users' });
  }
};

exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id)
      .select('-passwordHash -passwordResetToken -passwordResetExpiry')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [notificationCount, orgMembershipCount] = await Promise.all([
      Notification.countDocuments({ userId: user._id }),
      OrganizationMember.countDocuments({ userId: user._id, status: 'active' }),
    ]);

    return res.json({
      user,
      counts: {
        notifications: notificationCount,
        organizations: orgMembershipCount,
      },
    });
  } catch (error) {
    console.error('Admin user get error:', error);
    return res.status(500).json({ error: 'Failed to get user' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, subscriptionStatus, currentPlan } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const before = user.toJSON();
    const actor = getBasicAuthActor(req);

    if (name !== undefined) {
      user.name = String(name).trim();
    }

    if (role !== undefined) {
      if (!['user', 'admin'].includes(String(role))) {
        return res.status(400).json({ error: 'Invalid role. Must be user or admin.' });
      }
      user.role = String(role);
    }

    if (subscriptionStatus !== undefined) {
      const validStatuses = ['none', 'active', 'cancelled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid'];
      if (!validStatuses.includes(String(subscriptionStatus))) {
        return res.status(400).json({ error: 'Invalid subscription status' });
      }
      user.subscriptionStatus = String(subscriptionStatus);
    }

    if (currentPlan !== undefined) {
      const planStr = String(currentPlan).trim();
      if (planStr.length > 100) {
        return res.status(400).json({ error: 'Plan name too long (max 100 chars)' });
      }
      user.currentPlan = planStr || 'free';
    }

    await user.save();

    await createAuditEvent({
      ...actor,
      action: 'admin.user.update',
      entityType: 'User',
      entityId: String(user._id),
      before,
      after: user.toJSON(),
      meta: null,
    });

    return res.json({ user: user.toJSON() });
  } catch (error) {
    console.error('Admin user update error:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
};

exports.disableUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const before = user.toJSON();
    const actor = getBasicAuthActor(req);

    user.disabled = true;
    await user.save();

    await createAuditEvent({
      ...actor,
      action: 'admin.user.disable',
      entityType: 'User',
      entityId: String(user._id),
      before,
      after: user.toJSON(),
      meta: null,
    });

    return res.json({ message: 'User disabled successfully', user: user.toJSON() });
  } catch (error) {
    console.error('Admin user disable error:', error);
    return res.status(500).json({ error: 'Failed to disable user' });
  }
};

exports.enableUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const before = user.toJSON();
    const actor = getBasicAuthActor(req);

    user.disabled = false;
    await user.save();

    await createAuditEvent({
      ...actor,
      action: 'admin.user.enable',
      entityType: 'User',
      entityId: String(user._id),
      before,
      after: user.toJSON(),
      meta: null,
    });

    return res.json({ message: 'User enabled successfully', user: user.toJSON() });
  } catch (error) {
    console.error('Admin user enable error:', error);
    return res.status(500).json({ error: 'Failed to enable user' });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const [
      totalUsers,
      adminUsers,
      activeSubscriptions,
      disabledUsers,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ subscriptionStatus: 'active' }),
      User.countDocuments({ disabled: true }),
    ]);

    return res.json({
      total: totalUsers,
      admins: adminUsers,
      activeSubscriptions,
      disabled: disabledUsers,
    });
  } catch (error) {
    console.error('Admin user stats error:', error);
    return res.status(500).json({ error: 'Failed to get user stats' });
  }
};
