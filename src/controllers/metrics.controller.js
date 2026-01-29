const crypto = require('crypto');
const ActionEvent = require('../models/ActionEvent');
const GlobalSetting = require('../models/GlobalSetting');
const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

function parseCookieHeader(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function getMonthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

function getAnonId(req) {
  const headerAnon = req.get('x-anon-id');
  if (headerAnon) return String(headerAnon).trim();

  const cookies = parseCookieHeader(req.headers.cookie);
  if (cookies.enbauges_anon_id) return String(cookies.enbauges_anon_id).trim();

  const bodyAnon = req.body?.anonId;
  if (bodyAnon) return String(bodyAnon).trim();

  return null;
}

async function tryAttachUser(req) {
  if (req.user?._id) return;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return;

  try {
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);
    if (user) req.user = user;
  } catch (e) {
    // optional auth: ignore errors
  }
}

exports.track = async (req, res) => {
  try {
    // Validate request size to prevent abuse
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 1024 * 10) { // 10KB limit
      return res.status(413).json({ error: 'Request too large' });
    }

    await tryAttachUser(req);

    const action = String(req.body?.action || '').trim();
    const meta = req.body?.meta ?? null;

    // Validate action field
    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }
    
    if (action.length > 100) {
      return res.status(400).json({ error: 'action too long (max 100 characters)' });
    }
    
    // Validate action format (allow only alphanumeric, underscores, hyphens, dots)
    if (!/^[a-zA-Z0-9._-]+$/.test(action)) {
      return res.status(400).json({ error: 'invalid action format' });
    }

    // Validate meta size
    if (meta && JSON.stringify(meta).length > 1024 * 5) { // 5KB limit
      return res.status(400).json({ error: 'meta data too large' });
    }

    let actorType = 'anonymous';
    let actorId = getAnonId(req);

    if (req.user?._id) {
      actorType = 'user';
      actorId = String(req.user._id);
    }

    if (!actorId) {
      actorId = crypto.randomUUID();
      res.cookie('enbauges_anon_id', actorId, {
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 365,
        path: '/',
      });
    }

    await ActionEvent.create({
      action,
      actorType,
      actorId,
      meta,
    });

    return res.json({ ok: true, actorType, anonId: actorType === 'anonymous' ? actorId : null });
  } catch (error) {
    console.error('Metrics track error:', error);
    return res.status(500).json({ error: 'Failed to track' });
  }
};

exports.getImpact = async (req, res) => {
  try {
    // Validate query parameters
    const { start, end } = req.query;
    
    // Allow custom time ranges but restrict to reasonable limits
    let startTime, endTime;
    
    if (start || end) {
      // Parse custom range if provided
      startTime = start ? new Date(start) : null;
      endTime = end ? new Date(end) : null;
      
      // Validate dates
      if ((start && isNaN(startTime.getTime())) || (end && isNaN(endTime.getTime()))) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      
      // Restrict range to maximum 1 year
      if (startTime && endTime) {
        const rangeMs = endTime.getTime() - startTime.getTime();
        const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
        if (rangeMs > maxRangeMs) {
          return res.status(400).json({ error: 'Time range too large (max 1 year)' });
        }
      }
      
      // Default to current month if range is incomplete
      if (!startTime || !endTime) {
        const currentMonth = getMonthRange(new Date());
        startTime = startTime || currentMonth.start;
        endTime = endTime || currentMonth.end;
      }
    } else {
      // Default to current month
      const currentMonth = getMonthRange(new Date());
      startTime = currentMonth.start;
      endTime = currentMonth.end;
    }

    const activeActorsAgg = await ActionEvent.aggregate([
      {
        $match: {
          createdAt: { $gte: startTime, $lt: endTime },
          actorType: { $in: ['user', 'anonymous'] },
        },
      },
      {
        $group: {
          _id: {
            actorType: '$actorType',
            actorId: '$actorId',
          },
        },
      },
      { $count: 'count' },
    ]);

    const activeUsers = activeActorsAgg?.[0]?.count || 0;

    const servicesConsulted = await ActionEvent.countDocuments({
      action: 'service_view',
      createdAt: { $gte: startTime, $lt: endTime },
    });

    const newsletterSetting = await GlobalSetting.findOne({ key: 'newsletter_list' }).lean();
    let newsletterSubscribers = 0;
    if (newsletterSetting?.value) {
      try {
        const parsed = JSON.parse(newsletterSetting.value);
        if (Array.isArray(parsed)) newsletterSubscribers = parsed.length;
      } catch (e) {
        newsletterSubscribers = 0;
      }
    }

    // Add cache headers for better performance
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes cache

    return res.json({
      range: { start: startTime.toISOString(), end: endTime.toISOString() },
      activeUsers,
      servicesConsulted,
      newsletterSubscribers,
    });
  } catch (error) {
    console.error('Metrics impact error:', error);
    return res.status(500).json({ error: 'Failed to compute impact' });
  }
};
