const globalSettingsService = require('../services/globalSettings.service');
const { INTERNAL_CRON_TOKEN_SETTING_KEY } = require('../services/blogCronsBootstrap.service');

async function requireInternalCronToken(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = header.slice('Bearer '.length).trim();
    const expected = String(
      await globalSettingsService.getSettingValue(INTERNAL_CRON_TOKEN_SETTING_KEY, ''),
    ).trim();

    if (!expected || token !== expected) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  } catch (error) {
    console.error('internal cron auth error:', error);
    res.status(500).json({ error: 'Internal auth failed' });
  }
}

module.exports = {
  requireInternalCronToken,
};
