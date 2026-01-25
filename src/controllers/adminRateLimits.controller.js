const rateLimiter = require('../services/rateLimiter.service');

function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;

  if (code === 'VALIDATION' || code === 'INVALID_JSON') {
    return res.status(400).json({ error: msg });
  }
  if (code === 'NOT_FOUND') {
    return res.status(404).json({ error: msg });
  }

  return res.status(500).json({ error: msg });
}

exports.list = async (req, res) => {
  try {
    const items = await rateLimiter.list();
    return res.json({ items });
  } catch (error) {
    console.error('Error listing rate limits:', error);
    return handleServiceError(res, error);
  }
};

exports.getConfig = async (req, res) => {
  try {
    const { doc } = await rateLimiter.getRateLimitsConfigData();
    return res.json({
      config: {
        id: String(doc._id),
        slug: doc.slug,
        alias: doc.alias,
        title: doc.title,
        cacheTtlSeconds: Number(doc.cacheTtlSeconds || 0) || 0,
        jsonRaw: String(doc.jsonRaw || ''),
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error getting rate limits config:', error);
    return handleServiceError(res, error);
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const jsonRaw = req.body?.jsonRaw;
    if (jsonRaw === undefined || jsonRaw === null) {
      return res.status(400).json({ error: 'jsonRaw is required' });
    }

    const doc = await rateLimiter.updateRawConfig({ jsonRaw });
    return res.json({
      config: {
        id: String(doc._id),
        slug: doc.slug,
        alias: doc.alias,
        title: doc.title,
        cacheTtlSeconds: Number(doc.cacheTtlSeconds || 0) || 0,
        jsonRaw: String(doc.jsonRaw || ''),
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating rate limits config:', error);
    return handleServiceError(res, error);
  }
};

exports.updateLimiter = async (req, res) => {
  try {
    const limiterId = String(req.params.id || '').trim();
    if (!limiterId) return res.status(400).json({ error: 'id is required' });

    let override = req.body?.override;
    if (override === undefined) override = req.body;

    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      return res.status(400).json({ error: 'override must be an object' });
    }

    const config = await rateLimiter.setLimiterOverride(limiterId, override);
    return res.json({ config });
  } catch (error) {
    console.error('Error updating rate limit override:', error);
    return handleServiceError(res, error);
  }
};

exports.resetLimiter = async (req, res) => {
  try {
    const limiterId = String(req.params.id || '').trim();
    if (!limiterId) return res.status(400).json({ error: 'id is required' });

    const config = await rateLimiter.resetLimiterOverride(limiterId);
    return res.json({ config });
  } catch (error) {
    console.error('Error resetting rate limit override:', error);
    return handleServiceError(res, error);
  }
};

exports.getMetrics = async (req, res) => {
  try {
    const start = req.query?.start;
    const end = req.query?.end;

    const data = await rateLimiter.queryMetrics({ start, end });
    return res.json(data);
  } catch (error) {
    console.error('Error fetching rate limits metrics:', error);
    return handleServiceError(res, error);
  }
};

exports.bulkEnabled = async (req, res) => {
  try {
    const enabled = req.body?.enabled;
    const all = Boolean(req.body?.all);
    const ids = req.body?.ids;

    if (enabled !== true && enabled !== false) {
      return res.status(400).json({ error: 'enabled must be true or false' });
    }

    if (!all && !Array.isArray(ids)) {
      return res.status(400).json({ error: 'Provide ids[] or set all=true' });
    }

    const config = await rateLimiter.bulkSetEnabled({ enabled, all, ids });
    return res.json({ config });
  } catch (error) {
    console.error('Error bulk updating rate limits enabled state:', error);
    return handleServiceError(res, error);
  }
};
