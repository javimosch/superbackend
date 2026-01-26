const ContextBlockDefinition = require('../models/ContextBlockDefinition');

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

function normalizeProps(props) {
  if (!props) return {};
  if (typeof props !== 'object' || Array.isArray(props)) return null;
  return props;
}

function normalizeType(type) {
  return String(type || '').trim();
}

exports.list = async (req, res) => {
  try {
    const onlyActive = parseBool(req.query?.active, null);
    const filter = {};
    if (onlyActive !== null) filter.isActive = onlyActive;

    const items = await ContextBlockDefinition.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('[adminContextBlockDefinitions] list error:', error);
    return res.status(500).json({ error: 'Failed to list context block definitions' });
  }
};

exports.create = async (req, res) => {
  try {
    const code = normalizeCode(req.body?.code);
    const label = String(req.body?.label || '').trim();
    const type = normalizeType(req.body?.type);

    if (!code) return res.status(400).json({ error: 'code is required' });
    if (!label) return res.status(400).json({ error: 'label is required' });
    if (!type) return res.status(400).json({ error: 'type is required' });

    const props = normalizeProps(req.body?.props);
    if (props === null) return res.status(400).json({ error: 'props must be an object' });

    const doc = await ContextBlockDefinition.create({
      code,
      label,
      description: String(req.body?.description || ''),
      type,
      props: props || {},
      version: Number(req.body?.version || 1) || 1,
      isActive: parseBool(req.body?.isActive, true),
    });

    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('[adminContextBlockDefinitions] create error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    if (error?.code === 11000) return res.status(409).json({ error: 'Context block definition already exists' });
    return res.status(500).json({ error: 'Failed to create context block definition' });
  }
};

exports.get = async (req, res) => {
  try {
    const code = normalizeCode(req.params?.code);
    const item = await ContextBlockDefinition.findOne({ code }).lean();
    if (!item) return res.status(404).json({ error: 'Context block definition not found' });
    return res.json({ item });
  } catch (error) {
    console.error('[adminContextBlockDefinitions] get error:', error);
    return res.status(500).json({ error: 'Failed to load context block definition' });
  }
};

exports.update = async (req, res) => {
  try {
    const code = normalizeCode(req.params?.code);
    const doc = await ContextBlockDefinition.findOne({ code });
    if (!doc) return res.status(404).json({ error: 'Context block definition not found' });

    if (req.body?.label !== undefined) {
      const label = String(req.body.label || '').trim();
      if (!label) return res.status(400).json({ error: 'label is required' });
      doc.label = label;
    }

    if (req.body?.description !== undefined) doc.description = String(req.body.description || '');

    if (req.body?.type !== undefined) {
      const type = normalizeType(req.body.type);
      if (!type) return res.status(400).json({ error: 'type is required' });
      doc.type = type;
    }

    if (req.body?.props !== undefined) {
      const props = normalizeProps(req.body.props);
      if (props === null) return res.status(400).json({ error: 'props must be an object' });
      doc.props = props;
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
    console.error('[adminContextBlockDefinitions] update error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to update context block definition' });
  }
};

exports.remove = async (req, res) => {
  try {
    const code = normalizeCode(req.params?.code);
    const doc = await ContextBlockDefinition.findOne({ code });
    if (!doc) return res.status(404).json({ error: 'Context block definition not found' });

    await ContextBlockDefinition.deleteOne({ _id: doc._id });
    return res.json({ success: true });
  } catch (error) {
    console.error('[adminContextBlockDefinitions] remove error:', error);
    return res.status(500).json({ error: 'Failed to delete context block definition' });
  }
};
