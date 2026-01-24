const rbacService = require('../services/rbac.service');

function isBasicAuthSuperAdmin(req) {
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Basic ')) return false;

  try {
    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

    return username === adminUsername && password === adminPassword;
  } catch (e) {
    return false;
  }
}

function requireRight(requiredRight, options = {}) {
  const getOrgId = options.getOrgId || ((req) => req.params?.orgId || req.query?.orgId || req.body?.orgId);

  return async (req, res, next) => {
    try {
      if (isBasicAuthSuperAdmin(req)) {
        return next();
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const orgId = getOrgId(req);
      if (!orgId) {
        return res.status(400).json({ error: 'orgId is required for RBAC checks' });
      }

      const result = await rbacService.checkRight({
        userId: req.user._id,
        orgId,
        right: requiredRight,
      });

      if (!result.allowed) {
        return res.status(403).json({
          error: 'Access denied',
          reason: result.reason,
        });
      }

      return next();
    } catch (error) {
      console.error('RBAC requireRight error:', error);
      return res.status(500).json({ error: 'Failed to evaluate RBAC rights' });
    }
  };
}

module.exports = {
  requireRight,
  isBasicAuthSuperAdmin,
};
