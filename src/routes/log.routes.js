const express = require('express');
const router = express.Router();
const { logError, getConfig } = require('../services/errorLogger');
const { verifyAccessToken } = require('../utils/jwt');

const rateLimitStore = new Map();
const CLEANUP_INTERVAL = 60000;

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore) {
    if (now - data.windowStart > 60000) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

async function checkRateLimit(ip, isAuthenticated) {
  const config = await getConfig();
  const limit = isAuthenticated ? config.errorRateLimitPerMinute : config.errorRateLimitAnonPerMinute;
  const key = `${ip}:${isAuthenticated ? 'auth' : 'anon'}`;
  const now = Date.now();

  let data = rateLimitStore.get(key);
  if (!data || now - data.windowStart > 60000) {
    data = { windowStart: now, count: 0 };
    rateLimitStore.set(key, data);
  }

  data.count++;

  if (data.count > limit) {
    return { allowed: false, remaining: 0, limit };
  }

  return { allowed: true, remaining: limit - data.count, limit };
}

function extractUserFromToken(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    const decoded = verifyAccessToken(token);
    return { userId: decoded.userId, role: decoded.role };
  } catch (e) {
    return null;
  }
}

router.post('/error', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const user = extractUserFromToken(req);
    const isAuthenticated = !!user;

    const rateCheck = await checkRateLimit(ip, isAuthenticated);
    res.setHeader('X-RateLimit-Limit', rateCheck.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, rateCheck.remaining));

    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'Too many error reports. Please try again later.' });
    }

    const config = await getConfig();
    if (!config.errorTrackingEnabled) {
      return res.status(200).json({ ok: true, tracked: false });
    }

    const body = req.body || {};

    const event = {
      source: 'frontend',
      severity: body.severity || 'error',
      errorName: body.errorName || body.name || 'Error',
      errorCode: body.errorCode || body.code,
      message: String(body.message || '').slice(0, 2000),
      stack: String(body.stack || '').slice(0, 5000),
      actor: {
        userId: user?.userId,
        role: user?.role,
        ip,
        userAgent: req.headers['user-agent'],
      },
      request: {
        method: body.request?.method,
        path: body.request?.path || body.url,
        statusCode: body.request?.statusCode || body.statusCode,
        requestId: body.request?.requestId || req.headers['x-request-id'],
      },
      runtime: {
        url: String(body.url || body.runtime?.url || '').slice(0, 500),
        referrer: String(body.referrer || body.runtime?.referrer || '').slice(0, 500),
        viewport: body.runtime?.viewport,
        locale: body.runtime?.locale,
        appVersion: body.runtime?.appVersion,
      },
      extra: body.extra,
    };

    await logError(event);

    return res.status(200).json({ ok: true, tracked: true });
  } catch (err) {
    console.log('[LogRoutes] Error logging frontend error:', err.message);
    return res.status(500).json({ error: 'Failed to log error' });
  }
});

module.exports = router;
