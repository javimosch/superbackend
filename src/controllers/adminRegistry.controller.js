const registryService = require('../services/registry.service');

function handleError(res, error) {
  const code = error?.code;
  const message = error?.message || 'Operation failed';

  if (code === 'VALIDATION') return res.status(400).json({ error: message });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: message });
  if (code === 'CONFLICT') return res.status(409).json({ error: message });
  return res.status(500).json({ error: message });
}

exports.listRegistries = async (req, res) => {
  try {
    const items = await registryService.listRegistries();
    return res.json({ items });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createRegistry = async (req, res) => {
  try {
    const item = await registryService.createRegistry(req.body || {});
    return res.status(201).json({ item });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getRegistry = async (req, res) => {
  try {
    const item = await registryService.getRegistry(req.params.id);
    if (!item) return res.status(404).json({ error: 'registry not found' });
    return res.json({ item });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.updateRegistry = async (req, res) => {
  try {
    const item = await registryService.updateRegistry(req.params.id, req.body || {});
    return res.json({ item });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteRegistry = async (req, res) => {
  try {
    const result = await registryService.deleteRegistry(req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createToken = async (req, res) => {
  try {
    const result = await registryService.createToken(req.params.id, req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteToken = async (req, res) => {
  try {
    const result = await registryService.deleteToken(req.params.id, req.params.tokenId);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

exports.listItems = async (req, res) => {
  try {
    const result = await registryService.listItemsForRegistry(
      req.params.id,
      req.query,
      req.headers.authorization,
    );
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

exports.upsertItem = async (req, res) => {
  try {
    const item = await registryService.upsertItem(req.params.id, req.body || {});
    return res.json({ item });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const result = await registryService.deleteItem(req.params.id, req.params.itemId);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
};
