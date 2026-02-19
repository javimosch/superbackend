const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const ConsoleEntry = require('../models/ConsoleEntry');
const ConsoleLog = require('../models/ConsoleLog');
const GlobalSetting = require('../models/GlobalSetting');
const { consoleManager } = require('../services/consoleManager.service');

function normalizeTags(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((t) => String(t).trim()).filter(Boolean);
  return String(val)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function toInt(val, fallback) {
  const n = parseInt(String(val), 10);
  return Number.isFinite(n) ? n : fallback;
}

router.use(adminSessionAuth);

router.get('/config', async (req, res) => {
  try {
    const cfg = await consoleManager.getConfig();
    res.json({ config: cfg });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load config' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const cfg = req.body || {};
    await consoleManager.updateConfig(cfg);
    await consoleManager.applyDefaultsRetroactively(cfg);
    const next = await consoleManager.getConfig();
    res.json({ ok: true, config: next });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to update config' });
  }
});

router.get('/entries', async (req, res) => {
  try {
    const {
      method,
      enabled,
      q,
      sort = 'lastSeenAt',
      order = 'desc',
      page = 1,
      pageSize = 50,
      tags,
    } = req.query;

    const filter = {};

    if (method && ['debug', 'log', 'info', 'warn', 'error'].includes(String(method))) {
      filter.method = String(method);
    }

    if (enabled !== undefined) {
      if (String(enabled) === 'true') filter.enabled = true;
      if (String(enabled) === 'false') filter.enabled = false;
    }

    const tagList = normalizeTags(tags);
    if (tagList.length) {
      filter.tags = { $all: tagList };
    }

    if (q) {
      filter.$or = [
        { messageTemplate: { $regex: String(q), $options: 'i' } },
        { topFrame: { $regex: String(q), $options: 'i' } },
        { hash: { $regex: String(q), $options: 'i' } },
      ];
    }

    const sortField = ['lastSeenAt', 'countTotal', 'firstSeenAt', 'method'].includes(sort) ? sort : 'lastSeenAt';
    const sortOrder = String(order) === 'asc' ? 1 : -1;

    const limit = Math.min(200, Math.max(1, toInt(pageSize, 50)));
    const skip = (Math.max(1, toInt(page, 1)) - 1) * limit;

    const [items, total] = await Promise.all([
      ConsoleEntry.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      ConsoleEntry.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: {
        total,
        page: Math.max(1, toInt(page, 1)),
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to list entries' });
  }
});

router.put('/entries/bulk-enable', async (req, res) => {
  try {
    const body = req.body || {};
    const hashes = Array.isArray(body.hashes) ? body.hashes.map((h) => String(h).trim()).filter(Boolean) : [];
    const nextEnabled = Boolean(body.enabled);

    if (!hashes.length) {
      return res.status(400).json({ error: 'hashes is required' });
    }

    const result = await ConsoleEntry.updateMany(
      { hash: { $in: hashes } },
      { $set: { enabled: nextEnabled, enabledExplicit: true } },
    );

    res.json({ ok: true, matched: result.matchedCount ?? result.n, modified: result.modifiedCount ?? result.nModified });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to bulk update entries' });
  }
});

router.put('/entries/bulk-tags', async (req, res) => {
  try {
    const body = req.body || {};
    const hashes = Array.isArray(body.hashes) ? body.hashes.map((h) => String(h).trim()).filter(Boolean) : [];

    if (!hashes.length) {
      return res.status(400).json({ error: 'hashes is required' });
    }

    const add = normalizeTags(body.add);
    const remove = normalizeTags(body.remove);

    const update = {};
    if (add.length) {
      update.$addToSet = { tags: { $each: add } };
    }
    if (remove.length) {
      update.$pull = { tags: { $in: remove } };
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'add or remove tags required' });
    }

    await ConsoleEntry.updateMany({ hash: { $in: hashes } }, update);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to update tags' });
  }
});

router.get('/tags', async (req, res) => {
  try {
    const items = await ConsoleEntry.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);

    res.json({
      items: items.map((it) => ({ tag: it._id, count: it.count })),
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to list tags' });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { method, q, entryHash, page = 1, pageSize = 50, tags } = req.query;

    const filter = {};

    if (method && ['debug', 'log', 'info', 'warn', 'error'].includes(String(method))) {
      filter.method = String(method);
    }

    if (entryHash) {
      filter.entryHash = String(entryHash);
    }

    const tagList = normalizeTags(tags);
    if (tagList.length) {
      filter.tagsSnapshot = { $all: tagList };
    }

    if (q) {
      filter.$or = [
        { message: { $regex: String(q), $options: 'i' } },
        { argsPreview: { $regex: String(q), $options: 'i' } },
        { entryHash: { $regex: String(q), $options: 'i' } },
      ];
    }

    const limit = Math.min(200, Math.max(1, toInt(pageSize, 50)));
    const skip = (Math.max(1, toInt(page, 1)) - 1) * limit;

    const [items, total] = await Promise.all([
      ConsoleLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ConsoleLog.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: {
        total,
        page: Math.max(1, toInt(page, 1)),
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to list logs' });
  }
});

router.delete('/entries/bulk-delete', async (req, res) => {
  try {
    const body = req.body || {};
    const hashes = Array.isArray(body.hashes) ? body.hashes.map((h) => String(h).trim()).filter(Boolean) : [];
    const deleteLogs = Boolean(body.deleteLogs);

    if (!hashes.length) {
      return res.status(400).json({ error: 'hashes is required and cannot be empty' });
    }

    // Delete ConsoleEntry documents
    const entryResult = await ConsoleEntry.deleteMany({ hash: { $in: hashes } });
    let deletedLogs = 0;

    // Optionally delete associated ConsoleLog documents
    if (deleteLogs) {
      const logResult = await ConsoleLog.deleteMany({ entryHash: { $in: hashes } });
      deletedLogs = logResult.deletedCount ?? logResult.n;
    }

    res.json({
      ok: true,
      deletedEntries: entryResult.deletedCount ?? entryResult.n,
      deletedLogs,
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to bulk delete entries' });
  }
});

// Global Settings endpoint for console manager control
router.get('/global-setting', async (req, res) => {
  try {
    const globalSetting = await GlobalSetting.findOne({ key: 'CONSOLE_MANAGER_ENABLED' }).lean();
    const value = globalSetting ? globalSetting.value : 'true';
    res.json({ enabled: String(value) === 'true' });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load global setting' });
  }
});

router.put('/global-setting', async (req, res) => {
  try {
    const { enabled } = req.body;
    const enabledValue = Boolean(enabled) ? 'true' : 'false';
    
    await GlobalSetting.findOneAndUpdate(
      { key: 'CONSOLE_MANAGER_ENABLED' },
      { 
        key: 'CONSOLE_MANAGER_ENABLED', 
        value: enabledValue,
        type: 'string',
        description: 'Enable/disable console manager initialization (requires restart)'
      },
      { upsert: true, new: true }
    );
    
    res.json({ 
      ok: true, 
      enabled: Boolean(enabled),
      message: 'Console manager global setting updated. Restart required for changes to take effect.'
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to update global setting' });
  }
});

module.exports = router;
