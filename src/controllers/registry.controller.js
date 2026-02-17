const registryService = require('../services/registry.service');

function handleError(res, error) {
  const code = error?.code;
  const message = error?.message || 'Operation failed';

  if (code === 'VALIDATION') return res.status(400).json({ error: { code: 'INVALID_REQUEST', message } });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: { code: 'NOT_FOUND', message } });
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
}

exports.auth = async (req, res) => {
  try {
    const payload = await registryService.getAuthStatus(req.params.id, req.headers.authorization);
    return res.json(payload);
  } catch (error) {
    return handleError(res, error);
  }
};

exports.list = async (req, res) => {
  try {
    const payload = await registryService.listItemsForRegistry(
      req.params.id,
      req.query,
      req.headers.authorization,
    );
    return res.json(payload);
  } catch (error) {
    return handleError(res, error);
  }
};
