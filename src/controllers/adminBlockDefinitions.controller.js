const BlockDefinition = require('../models/BlockDefinition');

function parseBool(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

function normalizeCode(code) {
  return String(code || '').trim().toLowerCase();
}

function normalizeFields(fields) {
  if (!fields) return {};
  if (typeof fields !== 'object' || Array.isArray(fields)) return null;
  return fields;
}

exports.list = async (req, res) => {
  try {
    const onlyActive = parseBool(req.query?.active, null);
    const filter = {};
    if (onlyActive !== null) filter.isActive = onlyActive;

    const items = await BlockDefinition.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('[adminBlockDefinitions] list error:', error);
    return res.status(500).json({ error: 'Failed to list block definitions' });
  }
};

exports.create = async (req, res) => {
  try {
    const code = normalizeCode(req.body?.code);
    const label = String(req.body?.label || '').trim();
    if (!code) return res.status(400).json({ error: 'code is required' });
    if (!label) return res.status(400).json({ error: 'label is required' });

    const fields = normalizeFields(req.body?.fields);
    if (fields === null) return res.status(400).json({ error: 'fields must be an object' });

    const doc = await BlockDefinition.create({
      code,
      label,
      description: String(req.body?.description || ''),
      fields: fields || {},
      version: Number(req.body?.version || 1) || 1,
      isActive: parseBool(req.body?.isActive, true),
    });

    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('[adminBlockDefinitions] create error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    if (error?.code === 11000) return res.status(409).json({ error: 'Block already exists' });
    return res.status(500).json({ error: 'Failed to create block definition' });
  }
};

exports.get = async (req, res) => {
  try {
    const code = normalizeCode(req.params?.code);
    const item = await BlockDefinition.findOne({ code }).lean();
    if (!item) return res.status(404).json({ error: 'Block not found' });
    return res.json({ item });
  } catch (error) {
    console.error('[adminBlockDefinitions] get error:', error);
    return res.status(500).json({ error: 'Failed to load block definition' });
  }
};

exports.update = async (req, res) => {
  try {
    const code = normalizeCode(req.params?.code);
    const doc = await BlockDefinition.findOne({ code });
    if (!doc) return res.status(404).json({ error: 'Block not found' });

    if (req.body?.label !== undefined) {
      const label = String(req.body.label || '').trim();
      if (!label) return res.status(400).json({ error: 'label is required' });
      doc.label = label;
    }

    if (req.body?.description !== undefined) doc.description = String(req.body.description || '');

    if (req.body?.fields !== undefined) {
      const fields = normalizeFields(req.body.fields);
      if (fields === null) return res.status(400).json({ error: 'fields must be an object' });
      doc.fields = fields;
    }

    if (req.body?.version !== undefined) {
      const v = Number(req.body.version);
      if (!Number.isFinite(v) || v < 1) return res.status(400).json({ error: 'version must be a positive number' });
      doc.version = v;
    } else {
      doc.version = Number(doc.version || 1) + 1;
    }

    if (req.body?.isActive !== undefined) doc.isActive = Boolean(req.body.isActive);

    await doc.save();
    return res.json({ item: doc.toObject() });
  } catch (error) {
    console.error('[adminBlockDefinitions] update error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to update block definition' });
  }
};

exports.remove = async (req, res) => {
  try {
    const code = normalizeCode(req.params?.code);
    const doc = await BlockDefinition.findOne({ code });
    if (!doc) return res.status(404).json({ error: 'Block not found' });

    await BlockDefinition.deleteOne({ _id: doc._id });
    return res.json({ success: true });
  } catch (error) {
    console.error('[adminBlockDefinitions] remove error:', error);
    return res.status(500).json({ error: 'Failed to delete block definition' });
  }
};
