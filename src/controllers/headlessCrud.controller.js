const { getDynamicModel } = require('../services/headlessModels.service');

function getOperationFromRequest(req) {
  const method = String(req.method || '').toUpperCase();
  if (method === 'GET') return 'read';
  if (method === 'POST') return 'create';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  if (method === 'DELETE') return 'delete';
  return null;
}

function parseJsonMaybe(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function maybePopulate(Model, query, populateParam) {
  const populate = String(populateParam || '').trim();
  if (!populate) return query;

  const fields = populate
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f);

  for (const field of fields) {
    query = query.populate(field);
  }

  return query;
}

exports.list = async (req, res) => {
  try {
    const { modelCode } = req.params;
    const Model = await getDynamicModel(modelCode);

    const limit = Math.min(Number(req.query.limit || 50) || 50, 200);
    const skip = Number(req.query.skip || 0) || 0;
    const sort = parseJsonMaybe(req.query.sort) || { updatedAt: -1 };
    const filter = parseJsonMaybe(req.query.filter) || {};

    let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
    q = await maybePopulate(Model, q, req.query.populate);

    const items = await q.lean();
    const total = await Model.countDocuments(filter);

    return res.json({ items, total, limit, skip });
  } catch (error) {
    console.error('Error listing headless items:', error);
    return res.status(500).json({ error: 'Failed to list items' });
  }
};

exports.get = async (req, res) => {
  try {
    const { modelCode, id } = req.params;
    const Model = await getDynamicModel(modelCode);

    let q = Model.findById(id);
    q = await maybePopulate(Model, q, req.query.populate);
    const item = await q.lean();

    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.json({ item });
  } catch (error) {
    console.error('Error fetching headless item:', error);
    return res.status(500).json({ error: 'Failed to fetch item' });
  }
};

exports.create = async (req, res) => {
  try {
    const { modelCode } = req.params;
    const Model = await getDynamicModel(modelCode);

    const doc = await Model.create(req.body || {});
    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('Error creating headless item:', error);
    return res.status(500).json({ error: 'Failed to create item' });
  }
};

exports.update = async (req, res) => {
  try {
    const { modelCode, id } = req.params;
    const Model = await getDynamicModel(modelCode);

    const updated = await Model.findByIdAndUpdate(id, req.body || {}, {
      new: true,
      runValidators: false,
    });

    if (!updated) return res.status(404).json({ error: 'Item not found' });
    return res.json({ item: updated.toObject() });
  } catch (error) {
    console.error('Error updating headless item:', error);
    return res.status(500).json({ error: 'Failed to update item' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { modelCode, id } = req.params;
    const Model = await getDynamicModel(modelCode);

    const deleted = await Model.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Item not found' });

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting headless item:', error);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
};

exports._getOperationFromRequest = getOperationFromRequest;
