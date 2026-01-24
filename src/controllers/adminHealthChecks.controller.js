const HealthCheck = require('../models/HealthCheck');
const HealthCheckRun = require('../models/HealthCheckRun');
const HealthIncident = require('../models/HealthIncident');

const GlobalSetting = require('../models/GlobalSetting');
const { encryptString } = require('../utils/encryption');
const globalSettingsService = require('../services/globalSettings.service');

const healthChecksService = require('../services/healthChecks.service');
const healthChecksScheduler = require('../services/healthChecksScheduler.service');

const PUBLIC_STATUS_SETTING_KEY = 'healthChecks.publicStatusEnabled';

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

async function upsertEncryptedSetting({ key, description, value }) {
  const storedValue = JSON.stringify(encryptString(String(value || '')));

  let doc = await GlobalSetting.findOne({ key });
  if (!doc) {
    doc = await GlobalSetting.create({
      key,
      value: storedValue,
      type: 'encrypted',
      description,
      templateVariables: [],
      public: false,
    });
  } else {
    doc.value = storedValue;
    if (doc.description !== description) doc.description = description;
    doc.type = 'encrypted';
    doc.public = false;
    await doc.save();
  }

  globalSettingsService.clearSettingsCache();
  return doc;
}

async function ensurePublicStatusSettingExists() {
  const existing = await GlobalSetting.findOne({ key: PUBLIC_STATUS_SETTING_KEY });
  if (existing) return;

  await GlobalSetting.create({
    key: PUBLIC_STATUS_SETTING_KEY,
    value: 'false',
    type: 'boolean',
    description: 'Enable the public health checks status summary endpoint (/api/health-checks/status).',
    templateVariables: [],
    public: false,
  });

  globalSettingsService.clearSettingsCache();
}

async function getPublicStatusEnabled() {
  await ensurePublicStatusSettingExists();
  const raw = await globalSettingsService.getSettingValue(PUBLIC_STATUS_SETTING_KEY, 'false');
  return String(raw) === 'true';
}

function applyAuthSecretsToCheckDoc(doc, payload) {
  const type = String(payload?.httpAuth?.type || doc.httpAuth?.type || 'none');
  const next = {
    type,
    username: String(payload?.httpAuth?.username ?? doc.httpAuth?.username ?? ''),
    tokenSettingKey: doc.httpAuth?.tokenSettingKey,
    passwordSettingKey: doc.httpAuth?.passwordSettingKey,
  };

  if (type !== 'bearer') {
    next.tokenSettingKey = undefined;
  }
  if (type !== 'basic') {
    next.passwordSettingKey = undefined;
  }

  doc.httpAuth = next;
}

async function persistAuthSecrets(doc, payload) {
  const type = String(payload?.httpAuth?.type || doc.httpAuth?.type || 'none');

  if (type === 'bearer') {
    const rawToken = typeof payload?.httpAuth?.token === 'string' ? payload.httpAuth.token.trim() : '';
    if (rawToken) {
      const key = `healthChecks.${doc._id}.httpAuth.bearerToken`;
      await upsertEncryptedSetting({
        key,
        description: `Health check bearer token for ${doc.name}`,
        value: rawToken,
      });
      doc.httpAuth.tokenSettingKey = key;
    }
  }

  if (type === 'basic') {
    const rawPassword = typeof payload?.httpAuth?.password === 'string' ? payload.httpAuth.password : '';
    if (rawPassword) {
      const key = `healthChecks.${doc._id}.httpAuth.basicPassword`;
      await upsertEncryptedSetting({
        key,
        description: `Health check basic-auth password for ${doc.name}`,
        value: rawPassword,
      });
      doc.httpAuth.passwordSettingKey = key;
    }
  }
}

exports.getConfig = async (req, res) => {
  try {
    const publicStatusEnabled = await getPublicStatusEnabled();
    res.json({
      publicStatusEnabled,
      publicStatusPath: '/api/health-checks/status',
      globalSettingKey: PUBLIC_STATUS_SETTING_KEY,
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.updateConfig = async (req, res) => {
  try {
    await ensurePublicStatusSettingExists();

    const enabled = Boolean(req.body?.publicStatusEnabled);

    const doc = await GlobalSetting.findOne({ key: PUBLIC_STATUS_SETTING_KEY });
    doc.value = enabled ? 'true' : 'false';
    doc.type = 'boolean';
    doc.public = false;
    await doc.save();

    globalSettingsService.clearSettingsCache();

    res.json({ publicStatusEnabled: enabled });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.listHealthChecks = async (req, res) => {
  try {
    const items = await HealthCheck.find().sort({ updatedAt: -1 }).lean();
    const publicStatusEnabled = await getPublicStatusEnabled();
    res.json({ items, publicStatusEnabled });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getHealthCheck = async (req, res) => {
  try {
    const doc = await HealthCheck.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ item: doc });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.createHealthCheck = async (req, res) => {
  try {
    const payload = req.body || {};

    const checkType = String(payload.checkType || '').trim();
    if (!['http', 'script', 'internal'].includes(checkType)) {
      return res.status(400).json({ error: 'Invalid checkType' });
    }

    if (checkType === 'http' && !String(payload.httpUrl || '').trim()) {
      return res.status(400).json({ error: 'httpUrl is required for http checks' });
    }

    if (checkType === 'script' && !payload.scriptId) {
      return res.status(400).json({ error: 'scriptId is required for script checks' });
    }

    const cronExpression = String(payload.cronExpression || '').trim();
    if (!cronExpression) {
      return res.status(400).json({ error: 'cronExpression is required' });
    }

    const timezone = String(payload.timezone || 'UTC');
    const nextRunAt = healthChecksService.calculateNextRun(cronExpression, timezone);

    const doc = await HealthCheck.create({
      name: String(payload.name || '').trim(),
      description: String(payload.description || ''),
      enabled: payload.enabled === undefined ? true : Boolean(payload.enabled),
      cronExpression,
      timezone,
      nextRunAt,
      checkType,
      timeoutMs: payload.timeoutMs === undefined ? undefined : Number(payload.timeoutMs),

      httpMethod: String(payload.httpMethod || 'GET'),
      httpUrl: String(payload.httpUrl || '').trim() || undefined,
      httpHeaders: normalizeHeaders(payload.httpHeaders),
      httpBody: String(payload.httpBody || ''),
      httpBodyType: String(payload.httpBodyType || 'raw'),
      httpAuth: {
        type: String(payload.httpAuth?.type || 'none'),
        username: String(payload.httpAuth?.username || ''),
      },

      scriptId: payload.scriptId || undefined,
      scriptEnv: normalizeEnv(payload.scriptEnv),

      expectedStatusCodes: Array.isArray(payload.expectedStatusCodes) ? payload.expectedStatusCodes : undefined,
      maxLatencyMs: payload.maxLatencyMs === undefined ? undefined : Number(payload.maxLatencyMs),
      bodyMustMatch: payload.bodyMustMatch === undefined ? undefined : String(payload.bodyMustMatch || ''),
      bodyMustNotMatch: payload.bodyMustNotMatch === undefined ? undefined : String(payload.bodyMustNotMatch || ''),

      consecutiveFailuresToOpen: payload.consecutiveFailuresToOpen === undefined ? undefined : Number(payload.consecutiveFailuresToOpen),
      consecutiveSuccessesToResolve: payload.consecutiveSuccessesToResolve === undefined ? undefined : Number(payload.consecutiveSuccessesToResolve),

      retries: payload.retries === undefined ? undefined : Number(payload.retries),
      retryDelayMs: payload.retryDelayMs === undefined ? undefined : Number(payload.retryDelayMs),

      notifyOnOpen: payload.notifyOnOpen === undefined ? undefined : Boolean(payload.notifyOnOpen),
      notifyOnResolve: payload.notifyOnResolve === undefined ? undefined : Boolean(payload.notifyOnResolve),
      notifyOnEscalation: payload.notifyOnEscalation === undefined ? undefined : Boolean(payload.notifyOnEscalation),
      notificationChannel: String(payload.notificationChannel || 'in_app'),
      notifyUserIds: Array.isArray(payload.notifyUserIds) ? payload.notifyUserIds : [],
      suppressNotificationsWhenAcknowledged:
        payload.suppressNotificationsWhenAcknowledged === undefined ? undefined : Boolean(payload.suppressNotificationsWhenAcknowledged),

      autoHealEnabled: payload.autoHealEnabled === undefined ? undefined : Boolean(payload.autoHealEnabled),
      autoHealWaitMs: payload.autoHealWaitMs === undefined ? undefined : Number(payload.autoHealWaitMs),
      autoHealCooldownMs: payload.autoHealCooldownMs === undefined ? undefined : Number(payload.autoHealCooldownMs),
      autoHealMaxAttemptsPerIncident:
        payload.autoHealMaxAttemptsPerIncident === undefined ? undefined : Number(payload.autoHealMaxAttemptsPerIncident),
      autoHealBackoffPolicy: payload.autoHealBackoffPolicy === undefined ? undefined : String(payload.autoHealBackoffPolicy || 'fixed'),
      autoHealBackoffMs: payload.autoHealBackoffMs === undefined ? undefined : Number(payload.autoHealBackoffMs),
      autoHealActions: Array.isArray(payload.autoHealActions) ? payload.autoHealActions : [],

      createdBy: req.user?.username || 'admin',
    });

    // Apply secret refs and store secrets (if provided)
    applyAuthSecretsToCheckDoc(doc, payload);
    await persistAuthSecrets(doc, payload);
    await doc.save();

    if (doc.enabled) {
      await healthChecksScheduler.scheduleCheck(doc);
    }

    res.status(201).json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.updateHealthCheck = async (req, res) => {
  try {
    const payload = req.body || {};

    const doc = await HealthCheck.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const wasEnabled = doc.enabled;
    let needsReschedule = false;

    if (payload.name !== undefined) doc.name = String(payload.name || '').trim();
    if (payload.description !== undefined) doc.description = String(payload.description || '');

    if (payload.enabled !== undefined) {
      doc.enabled = Boolean(payload.enabled);
      needsReschedule = true;
    }

    if (payload.cronExpression !== undefined) {
      doc.cronExpression = String(payload.cronExpression || '').trim();
      needsReschedule = true;
    }

    if (payload.timezone !== undefined) {
      doc.timezone = String(payload.timezone || 'UTC');
      needsReschedule = true;
    }

    if (payload.checkType !== undefined) {
      doc.checkType = String(payload.checkType || '').trim();
    }

    if (payload.timeoutMs !== undefined) doc.timeoutMs = Number(payload.timeoutMs || 0);

    if (payload.httpMethod !== undefined) doc.httpMethod = String(payload.httpMethod || 'GET');
    if (payload.httpUrl !== undefined) doc.httpUrl = String(payload.httpUrl || '').trim();
    if (payload.httpHeaders !== undefined) doc.httpHeaders = normalizeHeaders(payload.httpHeaders);
    if (payload.httpBody !== undefined) doc.httpBody = String(payload.httpBody || '');
    if (payload.httpBodyType !== undefined) doc.httpBodyType = String(payload.httpBodyType || 'raw');

    if (payload.httpAuth !== undefined) {
      applyAuthSecretsToCheckDoc(doc, payload);
      await persistAuthSecrets(doc, payload);
    }

    if (payload.scriptId !== undefined) doc.scriptId = payload.scriptId || undefined;
    if (payload.scriptEnv !== undefined) doc.scriptEnv = normalizeEnv(payload.scriptEnv);

    if (payload.expectedStatusCodes !== undefined) {
      doc.expectedStatusCodes = Array.isArray(payload.expectedStatusCodes) ? payload.expectedStatusCodes : doc.expectedStatusCodes;
    }
    if (payload.maxLatencyMs !== undefined) doc.maxLatencyMs = payload.maxLatencyMs === null ? undefined : Number(payload.maxLatencyMs);
    if (payload.bodyMustMatch !== undefined) doc.bodyMustMatch = payload.bodyMustMatch ? String(payload.bodyMustMatch) : undefined;
    if (payload.bodyMustNotMatch !== undefined) doc.bodyMustNotMatch = payload.bodyMustNotMatch ? String(payload.bodyMustNotMatch) : undefined;

    if (payload.consecutiveFailuresToOpen !== undefined) doc.consecutiveFailuresToOpen = Number(payload.consecutiveFailuresToOpen);
    if (payload.consecutiveSuccessesToResolve !== undefined) doc.consecutiveSuccessesToResolve = Number(payload.consecutiveSuccessesToResolve);

    if (payload.retries !== undefined) doc.retries = Number(payload.retries);
    if (payload.retryDelayMs !== undefined) doc.retryDelayMs = Number(payload.retryDelayMs);

    if (payload.notifyOnOpen !== undefined) doc.notifyOnOpen = Boolean(payload.notifyOnOpen);
    if (payload.notifyOnResolve !== undefined) doc.notifyOnResolve = Boolean(payload.notifyOnResolve);
    if (payload.notifyOnEscalation !== undefined) doc.notifyOnEscalation = Boolean(payload.notifyOnEscalation);
    if (payload.notificationChannel !== undefined) doc.notificationChannel = String(payload.notificationChannel || 'in_app');
    if (payload.notifyUserIds !== undefined) doc.notifyUserIds = Array.isArray(payload.notifyUserIds) ? payload.notifyUserIds : [];
    if (payload.suppressNotificationsWhenAcknowledged !== undefined) {
      doc.suppressNotificationsWhenAcknowledged = Boolean(payload.suppressNotificationsWhenAcknowledged);
    }

    if (payload.autoHealEnabled !== undefined) doc.autoHealEnabled = Boolean(payload.autoHealEnabled);
    if (payload.autoHealWaitMs !== undefined) doc.autoHealWaitMs = Number(payload.autoHealWaitMs);
    if (payload.autoHealCooldownMs !== undefined) doc.autoHealCooldownMs = Number(payload.autoHealCooldownMs);
    if (payload.autoHealMaxAttemptsPerIncident !== undefined) {
      doc.autoHealMaxAttemptsPerIncident = Number(payload.autoHealMaxAttemptsPerIncident);
    }
    if (payload.autoHealBackoffPolicy !== undefined) doc.autoHealBackoffPolicy = String(payload.autoHealBackoffPolicy || 'fixed');
    if (payload.autoHealBackoffMs !== undefined) doc.autoHealBackoffMs = Number(payload.autoHealBackoffMs);
    if (payload.autoHealActions !== undefined) doc.autoHealActions = Array.isArray(payload.autoHealActions) ? payload.autoHealActions : [];

    if (needsReschedule) {
      if (doc.enabled) {
        doc.nextRunAt = healthChecksService.calculateNextRun(doc.cronExpression, doc.timezone);
      } else {
        doc.nextRunAt = null;
      }
    }

    await doc.save();

    if (needsReschedule) {
      if (wasEnabled && !doc.enabled) {
        await healthChecksScheduler.unscheduleCheck(doc._id);
      } else if (!wasEnabled && doc.enabled) {
        await healthChecksScheduler.scheduleCheck(doc);
      } else if (wasEnabled && doc.enabled) {
        await healthChecksScheduler.unscheduleCheck(doc._id);
        await healthChecksScheduler.scheduleCheck(doc);
      }
    }

    res.json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.deleteHealthCheck = async (req, res) => {
  try {
    const doc = await HealthCheck.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (doc.enabled) {
      await healthChecksScheduler.unscheduleCheck(doc._id);
    }

    await HealthCheck.deleteOne({ _id: doc._id });
    res.json({ deleted: true });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.enableHealthCheck = async (req, res) => {
  try {
    const doc = await HealthCheck.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (!doc.enabled) {
      doc.enabled = true;
      doc.nextRunAt = healthChecksService.calculateNextRun(doc.cronExpression, doc.timezone);
      await doc.save();
      await healthChecksScheduler.scheduleCheck(doc);
    }

    res.json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.disableHealthCheck = async (req, res) => {
  try {
    const doc = await HealthCheck.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (doc.enabled) {
      doc.enabled = false;
      doc.nextRunAt = null;
      await doc.save();
      await healthChecksScheduler.unscheduleCheck(doc._id);
    }

    res.json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.triggerHealthCheck = async (req, res) => {
  try {
    const doc = await HealthCheck.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const result = await healthChecksScheduler.trigger(doc._id);
    res.json(result);
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getRunHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const items = await HealthCheckRun.find({ healthCheckId: req.params.id })
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await HealthCheckRun.countDocuments({ healthCheckId: req.params.id });

    res.json({
      items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getIncidents = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const items = await HealthIncident.find({ healthCheckId: req.params.id })
      .sort({ openedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await HealthIncident.countDocuments({ healthCheckId: req.params.id });

    res.json({
      items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.acknowledgeIncident = async (req, res) => {
  try {
    const { id, incidentId } = req.params;

    const incident = await HealthIncident.findOne({ _id: incidentId, healthCheckId: id });
    if (!incident) return res.status(404).json({ error: 'Not found' });

    if (incident.status === 'open') {
      incident.status = 'acknowledged';
      incident.acknowledgedAt = new Date();
      await incident.save();
    }

    res.json({ item: incident.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.resolveIncident = async (req, res) => {
  try {
    const { id, incidentId } = req.params;

    const incident = await HealthIncident.findOne({ _id: incidentId, healthCheckId: id });
    if (!incident) return res.status(404).json({ error: 'Not found' });

    if (incident.status !== 'resolved') {
      incident.status = 'resolved';
      incident.resolvedAt = new Date();
      await incident.save();

      await HealthCheck.updateOne(
        { _id: id, currentIncidentId: incident._id },
        { $set: { currentIncidentId: null, consecutiveFailureCount: 0, consecutiveSuccessCount: 0 } },
      );
    }

    res.json({ item: incident.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};
