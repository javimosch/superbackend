const { authenticateApiToken, tokenAllowsOperation } = require('../services/headlessApiTokens.service');

function extractToken(req) {
  const headerToken = req.headers['x-api-token'] || req.headers['x-api-key'];
  if (headerToken) return String(headerToken).trim();

  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return String(auth.slice(7)).trim();
  }

  return null;
}

function getOperationFromMethod(method) {
  const m = String(method || '').toUpperCase();
  if (m === 'GET') return 'read';
  if (m === 'POST') return 'create';
  if (m === 'PUT' || m === 'PATCH') return 'update';
  if (m === 'DELETE') return 'delete';
  return null;
}

function headlessApiTokenAuth() {
  return async (req, res, next) => {
    try {
      const token = extractToken(req);
      const tokenDoc = await authenticateApiToken(token);
      if (!tokenDoc) return res.status(401).json({ error: 'Invalid or expired API token' });

      req.headlessApiToken = tokenDoc;
      return next();
    } catch (error) {
      console.error('Headless API token auth error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  };
}

function requireHeadlessPermission() {
  return (req, res, next) => {
    const modelCode = req.params.modelCode;
    const operation = getOperationFromMethod(req.method);

    if (!operation) return res.status(400).json({ error: 'Unsupported operation' });

    const ok = tokenAllowsOperation(req.headlessApiToken, modelCode, operation);
    if (!ok) return res.status(403).json({ error: 'Insufficient permissions' });

    return next();
  };
}

module.exports = {
  headlessApiTokenAuth,
  requireHeadlessPermission,
};
