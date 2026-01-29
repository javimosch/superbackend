const express = require('express');
const router = express.Router();
const { logError, getConfig } = require('../services/errorLogger');
const rateLimiter = require('../services/rateLimiter.service');

router.post('/error', async (req, res) => {
  try {
    // Determine if user is authenticated
    const authHeader = req.headers.authorization;
    const isAuthenticated = authHeader && authHeader.startsWith('Bearer ');
    
    // Choose appropriate limiter based on authentication status
    const limiterId = isAuthenticated ? 'errorReportingAuthLimiter' : 'errorReportingAnonLimiter';
    
    // Perform rate limit check
    let rateCheck;
    try {
      rateCheck = await rateLimiter.check(limiterId, { req });
      
      // Set rate limit headers to match current behavior
      res.setHeader('X-RateLimit-Limit', rateCheck.limit.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, rateCheck.remaining));
      
      if (!rateCheck.allowed) {
        return res.status(429).json({ 
          error: 'Too many error reports. Please try again later.' 
        });
      }
    } catch (rateLimitError) {
      // If rate limiter fails, allow the request (fail open behavior)
      console.error('[RateLimiter] Error checking rate limit:', rateLimitError);
      // Continue with error logging without rate limiting
    }

    const config = await getConfig();
    if (!config.errorTrackingEnabled) {
      return res.status(200).json({ ok: true, tracked: false });
    }

    const body = req.body || {};
    
    // Extract user info for attribution (same as before)
    let user = null;
    if (isAuthenticated) {
      try {
        const token = authHeader.slice(7).trim();
        const { verifyAccessToken } = require('../utils/jwt');
        const decoded = verifyAccessToken(token);
        user = { userId: decoded.userId, role: decoded.role };
      } catch (e) {
        // Invalid token, proceed as anonymous
        console.error('[LogRoutes] Invalid token:', e.message);
      }
    }

    const event = {
      source: 'frontend',
      severity: body.severity || 'error',
      errorName: body.errorName || body.name || 'Error',
      errorCode: body.errorCode || body.code,
      message: String(body.message || '').slice(0, 2000),
      stack: String(body.stack || '').slice(0, 5000),
      actor: {
        userId: user?.userId || null,
        role: user?.role || null,
        ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
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
