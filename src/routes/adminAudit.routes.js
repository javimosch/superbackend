const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AuditEvent = require('../models/AuditEvent');

router.get('/', async (req, res) => {
  try {
    const {
      actorType,
      actorId,
      action,
      outcome,
      targetType,
      targetId,
      q,
      from,
      to,
      page = 1,
      pageSize = 50,
    } = req.query;

    const filter = {};

    if (actorType && ['admin', 'user', 'system'].includes(actorType)) {
      filter.actorType = actorType;
    }

    if (actorId) {
      filter.actorId = String(actorId);
    }

    if (action) {
      filter.action = { $regex: action, $options: 'i' };
    }

    if (outcome && ['success', 'failure'].includes(outcome)) {
      filter.outcome = outcome;
    }

    if (targetType) {
      filter.targetType = { $regex: String(targetType), $options: 'i' };
    }

    if (targetId) {
      filter.targetId = String(targetId);
    }

    if (q) {
      filter.$or = [
        { action: { $regex: q, $options: 'i' } },
        { entityType: { $regex: q, $options: 'i' } },
        { targetType: { $regex: q, $options: 'i' } },
        { 'context.path': { $regex: q, $options: 'i' } },
      ];
    }

    const dateFilter = {};
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        dateFilter.$gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        dateFilter.$lte = toDate;
      }
    }
    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(pageSize, 10);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

    const [events, total] = await Promise.all([
      AuditEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditEvent.countDocuments(filter),
    ]);

    res.json({
      events,
      total,
      page: parseInt(page, 10),
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[AdminAudit] Failed to list audit events:', err);
    res.status(500).json({ error: 'Failed to list audit events' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, last24hCount, last7dCount, failures24h, byActorType, topActions] = await Promise.all([
      AuditEvent.countDocuments({}),
      AuditEvent.countDocuments({ createdAt: { $gte: last24h } }),
      AuditEvent.countDocuments({ createdAt: { $gte: last7d } }),
      AuditEvent.countDocuments({ createdAt: { $gte: last24h }, outcome: 'failure' }),
      AuditEvent.aggregate([
        { $match: { createdAt: { $gte: last24h } } },
        { $group: { _id: '$actorType', count: { $sum: 1 } } },
      ]),
      AuditEvent.aggregate([
        { $match: { createdAt: { $gte: last24h } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({
      total,
      last24h: last24hCount,
      last7d: last7dCount,
      failures24h,
      byActorType: byActorType.reduce((acc, a) => {
        acc[a._id] = a.count;
        return acc;
      }, {}),
      topActions: topActions.map((a) => ({ action: a._id, count: a.count })),
    });
  } catch (err) {
    console.error('[AdminAudit] Failed to get stats:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.get('/actions', async (req, res) => {
  try {
    const actions = await AuditEvent.distinct('action');
    res.json({ actions: actions.sort() });
  } catch (err) {
    console.error('[AdminAudit] Failed to get actions:', err);
    res.status(500).json({ error: 'Failed to get actions' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const event = await AuditEvent.findById(req.params.id).lean();
    if (!event) {
      return res.status(404).json({ error: 'Audit event not found' });
    }

    res.json(event);
  } catch (err) {
    console.error('[AdminAudit] Failed to get audit event:', err);
    res.status(500).json({ error: 'Failed to get audit event' });
  }
});

module.exports = router;
