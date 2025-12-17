const crypto = require('crypto');
const os = require('os');

const ErrorAggregate = require('../models/ErrorAggregate');

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
];

async function getConfig() {
  return {
    errorTrackingEnabled: process.env.ERROR_TRACKING_ENABLED !== 'false',
    errorMaxSamplesPerAggregate: parseInt(process.env.ERROR_MAX_SAMPLES, 10) || 20,
    errorSampleRatePercent: parseInt(process.env.ERROR_SAMPLE_RATE_PERCENT, 10) || 100,
    errorRateLimitPerMinute: parseInt(process.env.ERROR_RATE_LIMIT_PER_MINUTE, 10) || 30,
    errorRateLimitAnonPerMinute: parseInt(process.env.ERROR_RATE_LIMIT_ANON_PER_MINUTE, 10) || 10,
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

function normalizeMessage(message) {
  if (!message) return '';
  return String(message)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/[0-9a-f]{24}/gi, '<OBJECTID>')
    .replace(/\b\d{4,}\b/g, '<NUM>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function extractTopFrame(stack) {
  if (!stack) return null;
  const lines = String(stack).split('\n').slice(1, 4);
  for (const line of lines) {
    const match = line.match(/at\s+(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?/);
    if (match) {
      const fn = match[1] || '<anonymous>';
      const file = match[2].split('/').pop();
      return `${fn}@${file}:${match[3]}`;
    }
  }
  return null;
}

function computeFingerprint({ source, errorName, messageTemplate, topFrame, path, statusBucket }) {
  const parts = [
    source || 'unknown',
    errorName || 'Error',
    messageTemplate || '',
    topFrame || '',
    path || '',
    statusBucket || '',
  ];
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return hash.slice(0, 32);
}

function getStatusBucket(statusCode) {
  if (!statusCode) return null;
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  return null;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

let isLogging = false;

async function logError(event) {
  if (isLogging) return null;
  isLogging = true;

  try {
    const config = await getConfig();
    if (!config.errorTrackingEnabled) {
      return null;
    }

    if (config.errorSampleRatePercent < 100) {
      if (Math.random() * 100 > config.errorSampleRatePercent) {
        return null;
      }
    }

    const source = event.source || 'backend';
    const errorName = event.errorName || event.name || 'Error';
    const rawMessage = String(event.message || '').slice(0, 2000);
    const messageTemplate = normalizeMessage(rawMessage);
    const stack = String(event.stack || '').slice(0, 5000);
    const topFrame = extractTopFrame(stack);
    const path = event.request?.path || event.path || '';
    const statusCode = event.request?.statusCode || event.statusCode;
    const statusBucket = getStatusBucket(statusCode);

    const fingerprint = computeFingerprint({
      source,
      errorName,
      messageTemplate,
      topFrame,
      path,
      statusBucket,
    });

    const sample = {
      at: new Date(),
      message: rawMessage,
      stack,
      actor: scrubObject({
        userId: event.actor?.userId || event.userId,
        role: event.actor?.role || event.role,
        ip: event.actor?.ip || event.ip,
        userAgent: event.actor?.userAgent || event.userAgent,
      }),
      request: scrubObject({
        method: event.request?.method || event.method,
        path,
        statusCode,
        requestId: event.request?.requestId || event.requestId,
      }),
      runtime: scrubObject({
        ...(event.runtime || {}),
        nodeVersion: process.version,
        hostname: os.hostname(),
      }),
      extra: scrubObject(event.extra || {}),
    };

    const todayKey = getTodayKey();
    const maxSamples = config.errorMaxSamplesPerAggregate;

    const result = await ErrorAggregate.findOneAndUpdate(
      { fingerprint },
      {
        $inc: { countTotal: 1, [`countsByDay.${todayKey}`]: 1 },
        $set: { lastSeenAt: new Date() },
        $setOnInsert: {
          fingerprint,
          source,
          severity: event.severity || 'error',
          errorName,
          errorCode: event.errorCode || event.code,
          messageTemplate,
          topFrame,
          httpStatusBucket: statusBucket,
          firstSeenAt: new Date(),
          status: 'open',
        },
        $push: {
          samples: {
            $each: [sample],
            $slice: -maxSamples,
          },
        },
      },
      { upsert: true, new: true },
    );

    return result;
  } catch (err) {
    try {
      console.log('[ErrorLogger] Failed to log error:', err.message);
    } catch (e) {
      // ignore
    }
    return null;
  } finally {
    isLogging = false;
  }
}

function logErrorSync(event) {
  setImmediate(() => {
    logError(event).catch(() => {});
  });
}

module.exports = {
  logError,
  logErrorSync,
  getConfig,
  scrubObject,
  normalizeMessage,
  computeFingerprint,
};
