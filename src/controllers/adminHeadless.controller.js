const {
  listModelDefinitions,
  getModelDefinitionByCode,
  createModelDefinition,
  updateModelDefinition,
  disableModelDefinition,
  getDynamicModel,
} = require('../services/headlessModels.service');

const {
  listApiTokens,
  getApiTokenById,
  createApiToken,
  updateApiToken,
  deleteApiToken,
} = require('../services/headlessApiTokens.service');

function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;

  if (code === 'VALIDATION') return res.status(400).json({ error: msg });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: msg });
  if (code === 'CONFLICT') return res.status(409).json({ error: msg });

  return res.status(500).json({ error: msg });
}

exports.listModels = async (req, res) => {
  try {
    const items = await listModelDefinitions();
    return res.json({ items });
  } catch (error) {
    console.error('Error listing headless models:', error);
    return handleServiceError(res, error);
  }
};

exports.getModel = async (req, res) => {
  try {
    const item = await getModelDefinitionByCode(req.params.codeIdentifier);
    if (!item) return res.status(404).json({ error: 'Model not found' });
    return res.json({ item });
  } catch (error) {
    console.error('Error fetching headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.createModel = async (req, res) => {
  try {
    const item = await createModelDefinition(req.body || {});
    return res.status(201).json({ item });
  } catch (error) {
    console.error('Error creating headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.updateModel = async (req, res) => {
  try {
    const item = await updateModelDefinition(req.params.codeIdentifier, req.body || {});
    return res.json({ item });
  } catch (error) {
    console.error('Error updating headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.deleteModel = async (req, res) => {
  try {
    const item = await disableModelDefinition(req.params.codeIdentifier);
    return res.json({ item });
  } catch (error) {
    console.error('Error deleting headless model:', error);
    return handleServiceError(res, error);
  }
};

// Admin collections CRUD (bypass API tokens)
exports.listCollectionItems = async (req, res) => {
  try {
    const { modelCode } = req.params;
    const Model = await getDynamicModel(modelCode);

    const limit = Math.min(Number(req.query.limit || 50) || 50, 200);
    const skip = Number(req.query.skip || 0) || 0;

    let filter = {};
    let sort = { updatedAt: -1 };

    if (req.query.filter) {
      try {
        filter = JSON.parse(String(req.query.filter));
      } catch {
        return res.status(400).json({ error: 'Invalid filter JSON' });
      }
    }

    if (req.query.sort) {
      try {
        sort = JSON.parse(String(req.query.sort));
      } catch {
        return res.status(400).json({ error: 'Invalid sort JSON' });
      }
    }

    const items = await Model.find(filter).sort(sort).skip(skip).limit(limit).lean();
    const total = await Model.countDocuments(filter);

    return res.json({ items, total, limit, skip });
  } catch (error) {
    console.error('Error listing headless collection items:', error);
    return handleServiceError(res, error);
  }
};

exports.createCollectionItem = async (req, res) => {
  try {
    const { modelCode } = req.params;
    const Model = await getDynamicModel(modelCode);

    const modelDef = await getModelDefinitionByCode(modelCode);
    if (!modelDef) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const payload = { ...req.body };
    for (const field of modelDef.fields || []) {
      if (field.required && payload[field.name] === undefined) {
        if (field.default !== undefined) {
          payload[field.name] = field.default;
        } else if (field.type === 'boolean') {
          payload[field.name] = false;
        } else if (field.type === 'number') {
          payload[field.name] = 0;
        } else if (field.type === 'date') {
          payload[field.name] = new Date();
        } else {
          payload[field.name] = '';
        }
      }
    }

    const doc = await Model.create(payload);
    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('Error creating headless collection item:', error);
    return handleServiceError(res, error);
  }
};

exports.updateCollectionItem = async (req, res) => {
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
    console.error('Error updating headless collection item:', error);
    return handleServiceError(res, error);
  }
};

exports.deleteCollectionItem = async (req, res) => {
  try {
    const { modelCode, id } = req.params;
    const Model = await getDynamicModel(modelCode);

    const deleted = await Model.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Item not found' });

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting headless collection item:', error);
    return handleServiceError(res, error);
  }
};

// API tokens
exports.listTokens = async (req, res) => {
  try {
    const items = await listApiTokens();
    return res.json({ items });
  } catch (error) {
    console.error('Error listing headless API tokens:', error);
    return handleServiceError(res, error);
  }
};

exports.getToken = async (req, res) => {
  try {
    const item = await getApiTokenById(req.params.id);
    if (!item) return res.status(404).json({ error: 'API token not found' });
    return res.json({ item });
  } catch (error) {
    console.error('Error fetching headless API token:', error);
    return handleServiceError(res, error);
  }
};

exports.createToken = async (req, res) => {
  try {
    const { token, item } = await createApiToken(req.body || {});
    return res.status(201).json({ token, item });
  } catch (error) {
    console.error('Error creating headless API token:', error);
    return handleServiceError(res, error);
  }
};

exports.updateToken = async (req, res) => {
  try {
    const item = await updateApiToken(req.params.id, req.body || {});
    return res.json({ item });
  } catch (error) {
    console.error('Error updating headless API token:', error);
    return handleServiceError(res, error);
  }
};

exports.deleteToken = async (req, res) => {
  try {
    const result = await deleteApiToken(req.params.id);
    return res.json(result);
  } catch (error) {
    console.error('Error deleting headless API token:', error);
    return handleServiceError(res, error);
  }
};
