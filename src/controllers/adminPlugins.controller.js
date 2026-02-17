const pluginsService = require('../services/plugins.service');

function handleError(res, error) {
  const code = error?.code;
  const message = error?.message || 'Operation failed';

  if (code === 'NOT_FOUND') return res.status(404).json({ error: message });
  if (code === 'VALIDATION') return res.status(400).json({ error: message });
  return res.status(500).json({ error: message });
}

function runtimeContext(req) {
  const superbackend = globalThis.superbackend || globalThis.saasbackend || {};
  return {
    services: superbackend.services || {},
    helpers: superbackend.helpers || {},
    request: req,
  };
}

exports.list = async (req, res) => {
  try {
    const items = await pluginsService.listPlugins();
    return res.json({ items });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.enable = async (req, res) => {
  try {
    const result = await pluginsService.enablePlugin(req.params.id, { context: runtimeContext(req) });
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

exports.disable = async (req, res) => {
  try {
    const result = await pluginsService.disablePlugin(req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

exports.install = async (req, res) => {
  try {
    const result = await pluginsService.installPlugin(req.params.id, { context: runtimeContext(req) });
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
};
