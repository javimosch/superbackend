const express = require('express');
const router = express.Router();
const ErrorAggregate = require('../models/ErrorAggregate');

router.get('/', async (req, res) => {
  try {
    const {
      source,
      severity,
      status,
      q,
      sort = 'lastSeenAt',
      order = 'desc',
      page = 1,
      pageSize = 20,
      since,
    } = req.query;

    const filter = {};

    if (source && ['frontend', 'backend'].includes(source)) {
      filter.source = source;
    }
    if (severity && ['fatal', 'error', 'warn', 'info'].includes(severity)) {
      filter.severity = severity;
    }
    if (status && ['open', 'ignored', 'resolved'].includes(status)) {
      filter.status = status;
    }
    if (q) {
      filter.$or = [
        { messageTemplate: { $regex: q, $options: 'i' } },
        { errorName: { $regex: q, $options: 'i' } },
      ];
    }
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        filter.lastSeenAt = { $gte: sinceDate };
      }
    }

    const sortField = ['lastSeenAt', 'countTotal', 'firstSeenAt', 'errorName'].includes(sort) ? sort : 'lastSeenAt';
    const sortOrder = order === 'asc' ? 1 : -1;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(pageSize, 10);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

    const [errors, total] = await Promise.all([
      ErrorAggregate.find(filter)
        .select('-samples')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      ErrorAggregate.countDocuments(filter),
    ]);

    res.json({
      errors,
      total,
      page: parseInt(page, 10),
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[AdminErrors] Failed to list errors:', err);
    res.status(500).json({ error: 'Failed to list errors' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, open, last24hCount, last7dCount, bySource, bySeverity] = await Promise.all([
      ErrorAggregate.countDocuments({}),
      ErrorAggregate.countDocuments({ status: 'open' }),
      ErrorAggregate.countDocuments({ lastSeenAt: { $gte: last24h } }),
      ErrorAggregate.countDocuments({ lastSeenAt: { $gte: last7d } }),
      ErrorAggregate.aggregate([
        { $group: { _id: '$source', count: { $sum: 1 }, totalOccurrences: { $sum: '$countTotal' } } },
      ]),
      ErrorAggregate.aggregate([
        { $group: { _id: '$severity', count: { $sum: 1 }, totalOccurrences: { $sum: '$countTotal' } } },
      ]),
    ]);

    res.json({
      total,
      open,
      last24h: last24hCount,
      last7d: last7dCount,
      bySource: bySource.reduce((acc, s) => {
        acc[s._id] = { count: s.count, totalOccurrences: s.totalOccurrences };
        return acc;
      }, {}),
      bySeverity: bySeverity.reduce((acc, s) => {
        acc[s._id] = { count: s.count, totalOccurrences: s.totalOccurrences };
        return acc;
      }, {}),
    });
  } catch (err) {
    console.error('[AdminErrors] Failed to get stats:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const error = await ErrorAggregate.findById(req.params.id).lean();
    if (!error) {
      return res.status(404).json({ error: 'Error not found' });
    }
    res.json(error);
  } catch (err) {
    console.error('[AdminErrors] Failed to get error:', err);
    res.status(500).json({ error: 'Failed to get error' });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'ignored', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const update = { status };
    if (status === 'resolved') {
      update.resolvedAt = new Date();
    } else {
      update.resolvedAt = null;
    }

    const error = await ErrorAggregate.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean();

    if (!error) {
      return res.status(404).json({ error: 'Error not found' });
    }

    res.json(error);
  } catch (err) {
    console.error('[AdminErrors] Failed to update error status:', err);
    res.status(500).json({ error: 'Failed to update error status' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await ErrorAggregate.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Error not found' });
    }
    res.json({ message: 'Error deleted' });
  } catch (err) {
    console.error('[AdminErrors] Failed to delete error:', err);
    res.status(500).json({ error: 'Failed to delete error' });
  }
});

module.exports = router;
