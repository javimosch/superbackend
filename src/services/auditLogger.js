const AuditEvent = require('../models/AuditEvent');

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'accesstoken',
  'refreshtoken',
  'passwordhash',
];

async function getConfig() {
  return {
    auditTrackingEnabled: process.env.AUDIT_TRACKING_ENABLED !== 'false',
    auditLogFailedAttempts: process.env.AUDIT_LOG_FAILED_ATTEMPTS !== 'false',
    auditRetentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS, 10) || 90,
  };
}

function scrubValue(key, value) {
  const lowerKey = String(key).toLowerCase();
  for (const sensitive of SENSITIVE_KEYS) {
    if (lowerKey.includes(sensitive)) {
      return '[REDACTED]';
    }
  }
  return value;
}

function scrubObject(obj, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map((item) => scrubObject(item, depth + 1));
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = scrubObject(value, depth + 1);
    } else {
      result[key] = scrubValue(key, value);
    }
  }
  return result;
}

function extractContext(req) {
  if (!req) return {};
  return {
    ip: req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress,
    userAgent: req.headers?.['user-agent']?.slice(0, 500),
    requestId: req.headers?.['x-request-id'] || req.requestId,
    path: req.path || req.url,
    method: req.method,
  };
}

function extractActor(req) {
  if (!req) {
    return { actorType: 'system', actorId: null };
  }

  if (req.user) {
    return {
      actorType: 'user',
      actorId: String(req.user._id || req.user.id),
    };
  }

  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
      const [username] = credentials.split(':');
      return { actorType: 'admin', actorId: username || null };
    } catch (e) {
      return { actorType: 'admin', actorId: null };
    }
  }

  return { actorType: 'system', actorId: null };
}

async function logAudit(event) {
  try {
    const config = await getConfig();
    if (!config.auditTrackingEnabled) {
      return null;
    }

    if (event.outcome === 'failure' && !config.auditLogFailedAttempts) {
      return null;
    }

    const actor = event.actor || extractActor(event.req);
    const context = event.context || extractContext(event.req);

    const auditEvent = await AuditEvent.create({
      actorType: actor.actorType || 'system',
      actorId: actor.actorId || null,
      action: event.action,
      entityType: event.entityType || event.targetType || 'unknown',
      entityId: event.entityId || event.targetId || null,
      before: event.before || null,
      after: event.after || null,
      meta: scrubObject({
        ...(event.meta || {}),
        outcome: event.outcome || 'success',
        context,
        details: scrubObject(event.details || {}),
      }),
      outcome: event.outcome || 'success',
      context,
      targetType: event.targetType || event.entityType,
      targetId: event.targetId || event.entityId,
    });

    return auditEvent;
  } catch (err) {
    try {
      console.log('[AuditLogger] Failed to log audit:', err.message);
    } catch (e) {
      // ignore
    }
    return null;
  }
}

function logAuditSync(event) {
  setImmediate(() => {
    logAudit(event).catch(() => {});
  });
}

function auditMiddleware(action, options = {}) {
  return (req, res, next) => {
    const originalEnd = res.end;
    res.end = function (...args) {
      const outcome = res.statusCode >= 400 ? 'failure' : 'success';
      logAuditSync({
        req,
        action,
        outcome,
        entityType: options.entityType || options.targetType,
        entityId: options.getEntityId ? options.getEntityId(req) : (req.params?.id || req.params?.key),
        details: options.getDetails ? options.getDetails(req, res) : undefined,
      });
      return originalEnd.apply(this, args);
    };
    next();
  };
}

module.exports = {
  logAudit,
  logAuditSync,
  auditMiddleware,
  getConfig,
  extractActor,
  extractContext,
  scrubObject,
};
