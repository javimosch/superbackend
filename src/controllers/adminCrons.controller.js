const CronJob = require('../models/CronJob');
const CronExecution = require('../models/CronExecution');
const parser = require('cron-parser');
const { startRun } = require('../services/scriptsRunner.service');
const cronScheduler = require('../services/cronScheduler.service');

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'CONFLICT') return { status: 409, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function normalizeEnv(env) {
  const items = Array.isArray(env) ? env : [];
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const key = String(it.key || '').trim();
    if (!key) continue;
    out.push({ key, value: String(it.value || '') });
  }
  return out;
}

function normalizeHeaders(headers) {
  const items = Array.isArray(headers) ? headers : [];
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const key = String(it.key || '').trim();
    if (!key) continue;
    out.push({ key, value: String(it.value || '') });
  }
  return out;
}

function calculateNextRun(cronExpression, timezone = 'UTC') {
  try {
    const interval = parser.parseExpression(cronExpression, {
      tz: timezone,
    });
    return interval.next().toDate();
  } catch (err) {
    throw new Error(`Invalid cron expression: ${err.message}`);
  }
}

exports.listCronJobs = async (req, res) => {
  try {
    const items = await CronJob.find()
      .populate('scriptId', 'name type runner')
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ items });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getCronJob = async (req, res) => {
  try {
    const doc = await CronJob.findById(req.params.id)
      .populate('scriptId', 'name type runner')
      .lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ item: doc });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.createCronJob = async (req, res) => {
  try {
    const payload = req.body || {};

    // Validate cron expression
    const nextRunAt = calculateNextRun(payload.cronExpression, payload.timezone);

    // Validate task type requirements
    if (payload.taskType === 'script' && (!payload.scriptId || payload.scriptId === "")) {
      return res.status(400).json({ error: 'Script ID is required for script-type cron jobs' });
    }
    if (payload.taskType === 'http' && (!payload.httpUrl || payload.httpUrl.trim() === "")) {
      return res.status(400).json({ error: 'URL is required for HTTP-type cron jobs' });
    }

    // Handle scriptId - convert empty string to null for script jobs
    let scriptId = payload.scriptId;
    if (scriptId === "" || scriptId === null || scriptId === undefined) {
      scriptId = undefined;
    }

    const doc = await CronJob.create({
      name: String(payload.name || '').trim(),
      description: String(payload.description || ''),
      cronExpression: String(payload.cronExpression || '').trim(),
      timezone: String(payload.timezone || 'UTC'),
      enabled: payload.enabled === undefined ? true : Boolean(payload.enabled),
      nextRunAt,
      taskType: String(payload.taskType || '').trim(),
      scriptId,
      scriptEnv: normalizeEnv(payload.scriptEnv),
      httpMethod: String(payload.httpMethod || 'GET'),
      httpUrl: payload.taskType === 'http' ? String(payload.httpUrl || '').trim() : undefined,
      httpHeaders: normalizeHeaders(payload.httpHeaders),
      httpBody: String(payload.httpBody || ''),
      httpBodyType: String(payload.httpBodyType || 'raw'),
      httpAuth: {
        type: String(payload.httpAuth?.type || 'none'),
        token: String(payload.httpAuth?.token || ''),
        username: String(payload.httpAuth?.username || ''),
        password: String(payload.httpAuth?.password || ''),
      },
      timeoutMs: payload.timeoutMs === undefined ? 300000 : Number(payload.timeoutMs),
      createdBy: req.user?.username || 'admin',
    });

    // Schedule the job if enabled
    if (doc.enabled) {
      await cronScheduler.scheduleJob(doc);
    }

    res.status(201).json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.updateCronJob = async (req, res) => {
  try {
    const payload = req.body || {};

    const doc = await CronJob.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const wasEnabled = doc.enabled;
    let needsReschedule = false;

    if (payload.name !== undefined) doc.name = String(payload.name || '').trim();
    if (payload.description !== undefined) doc.description = String(payload.description || '');
    if (payload.cronExpression !== undefined) {
      doc.cronExpression = String(payload.cronExpression || '').trim();
      needsReschedule = true;
    }
    if (payload.timezone !== undefined) {
      doc.timezone = String(payload.timezone || 'UTC');
      needsReschedule = true;
    }
    if (payload.enabled !== undefined) {
      doc.enabled = Boolean(payload.enabled);
      needsReschedule = true;
    }
    if (payload.taskType !== undefined) {
      const newTaskType = String(payload.taskType || '').trim();
      
      // Validate task type requirements
      if (newTaskType === 'script' && (!payload.scriptId || payload.scriptId === "")) {
        return res.status(400).json({ error: 'Script ID is required for script-type cron jobs' });
      }
      if (newTaskType === 'http' && (!payload.httpUrl || payload.httpUrl.trim() === "")) {
        return res.status(400).json({ error: 'URL is required for HTTP-type cron jobs' });
      }
      
      doc.taskType = newTaskType;
    }
    if (payload.scriptId !== undefined) {
      // Handle scriptId - convert empty string to null
      let scriptId = payload.scriptId;
      if (scriptId === "" || scriptId === null || scriptId === undefined) {
        doc.scriptId = undefined;
      } else {
        doc.scriptId = scriptId;
      }
    }
    if (payload.scriptEnv !== undefined) doc.scriptEnv = normalizeEnv(payload.scriptEnv);
    if (payload.httpMethod !== undefined) doc.httpMethod = String(payload.httpMethod || 'GET');
    if (payload.httpUrl !== undefined) doc.httpUrl = String(payload.httpUrl || '').trim();
    if (payload.httpHeaders !== undefined) doc.httpHeaders = normalizeHeaders(payload.httpHeaders);
    if (payload.httpBody !== undefined) doc.httpBody = String(payload.httpBody || '');
    if (payload.httpBodyType !== undefined) doc.httpBodyType = String(payload.httpBodyType || 'raw');
    if (payload.httpAuth !== undefined) {
      doc.httpAuth = {
        type: String(payload.httpAuth?.type || 'none'),
        token: String(payload.httpAuth?.token || ''),
        username: String(payload.httpAuth?.username || ''),
        password: String(payload.httpAuth?.password || ''),
      };
    }
    if (payload.timeoutMs !== undefined) doc.timeoutMs = Number(payload.timeoutMs || 0);

    // Recalculate next run time if schedule changed
    if (needsReschedule) {
      if (doc.enabled) {
        doc.nextRunAt = calculateNextRun(doc.cronExpression, doc.timezone);
      } else {
        doc.nextRunAt = null;
      }
    }

    await doc.save();

    // Update scheduler
    if (needsReschedule) {
      if (wasEnabled && !doc.enabled) {
        await cronScheduler.unscheduleJob(doc._id);
      } else if (!wasEnabled && doc.enabled) {
        await cronScheduler.scheduleJob(doc);
      } else if (wasEnabled && doc.enabled) {
        await cronScheduler.unscheduleJob(doc._id);
        await cronScheduler.scheduleJob(doc);
      }
    }

    res.json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.deleteCronJob = async (req, res) => {
  try {
    const doc = await CronJob.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Unschedule before deleting
    if (doc.enabled) {
      await cronScheduler.unscheduleJob(doc._id);
    }

    await CronJob.deleteOne({ _id: doc._id });
    res.json({ deleted: true });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.enableCronJob = async (req, res) => {
  try {
    const doc = await CronJob.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (!doc.enabled) {
      doc.enabled = true;
      doc.nextRunAt = calculateNextRun(doc.cronExpression, doc.timezone);
      await doc.save();
      await cronScheduler.scheduleJob(doc);
    }

    res.json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.disableCronJob = async (req, res) => {
  try {
    const doc = await CronJob.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (doc.enabled) {
      doc.enabled = false;
      doc.nextRunAt = null;
      await doc.save();
      await cronScheduler.unscheduleJob(doc._id);
    }

    res.json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.triggerCronJob = async (req, res) => {
  try {
    const doc = await CronJob.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Execute immediately
    const execution = await cronScheduler.executeJob(doc);
    
    res.json({ executionId: execution._id });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getExecutionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const items = await CronExecution.find({ cronJobId: req.params.id })
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await CronExecution.countDocuments({ cronJobId: req.params.id });

    res.json({
      items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getExecution = async (req, res) => {
  try {
    const doc = await CronExecution.findById(req.params.eid)
      .populate('cronJobId', 'name taskType')
      .lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ item: doc });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getCronPresets = async (req, res) => {
  try {
    const presets = [
      { label: 'Every minute', expression: '* * * * *' },
      { label: 'Every 5 minutes', expression: '*/5 * * * *' },
      { label: 'Every 15 minutes', expression: '*/15 * * * *' },
      { label: 'Every 30 minutes', expression: '*/30 * * * *' },
      { label: 'Every hour', expression: '0 * * * *' },
      { label: 'Every 2 hours', expression: '0 */2 * * *' },
      { label: 'Every 6 hours', expression: '0 */6 * * *' },
      { label: 'Every day at midnight', expression: '0 0 * * *' },
      { label: 'Every day at 9 AM', expression: '0 9 * * *' },
      { label: 'Every Monday at 9 AM', expression: '0 9 * * 1' },
      { label: 'First day of month', expression: '0 0 1 * *' },
      { label: 'Weekdays only', expression: '0 9 * * 1-5' },
    ];
    res.json({ presets });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.previewNextRuns = async (req, res) => {
  try {
    const { cronExpression, timezone = 'UTC', count = 5 } = req.body;
    
    if (!cronExpression) {
      return res.status(400).json({ error: 'cronExpression is required' });
    }

    const runs = [];
    const interval = parser.parseExpression(cronExpression, {
      tz: timezone,
    });

    for (let i = 0; i < parseInt(count); i++) {
      try {
        runs.push(interval.next().toDate());
      } catch (err) {
        break;
      }
    }

    res.json({ runs });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};
