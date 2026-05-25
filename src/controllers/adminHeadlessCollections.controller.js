const {
  getDynamicModel,
} = require('../services/headlessModels.service');
const {
  listApiTokens,
  getApiTokenById,
  createApiToken,
  updateApiToken,
  deleteApiToken,
} = require('../services/headlessApiTokens.service');
const axios = require('axios');
const { logAudit, scrubObject } = require('../services/auditLogger');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const { getSettingValue } = require('../services/globalSettings.service');

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

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
        filter = JSON.parse(req.query.filter);
      } catch {
        filter = {};
      }
    }

    if (req.query.sort) {
      try {
        sort = JSON.parse(req.query.sort);
      } catch {
        sort = { updatedAt: -1 };
      }
    }

    const [items, total] = await Promise.all([
      Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Model.countDocuments(filter),
    ]);

    return res.json({ items, total, limit, skip });
  } catch (error) {
    console.error('[HeadlessCollections] listCollectionItems error:', error);
    return res.status(500).json({ error: error.message || 'Failed to list items' });
  }
};

exports.createCollectionItem = async (req, res) => {
  try {
    const { modelCode } = req.params;
    const Model = await getDynamicModel(modelCode);
    const doc = await Model.create(req.body || {});
    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('[HeadlessCollections] createCollectionItem error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create item' });
  }
};

exports.updateCollectionItem = async (req, res) => {
  try {
    const { modelCode, id } = req.params;
    const Model = await getDynamicModel(modelCode);
    const updated = await Model.findByIdAndUpdate(id, req.body || {}, { new: true, runValidators: false });
    if (!updated) return res.status(404).json({ error: 'Item not found' });
    return res.json({ item: updated.toObject() });
  } catch (error) {
    console.error('[HeadlessCollections] updateCollectionItem error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update item' });
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
    console.error('[HeadlessCollections] deleteCollectionItem error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete item' });
  }
};

exports.executeCollectionsApiTest = async (req, res) => {
  try {
    const { method, url, headers, body } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const config = {
      method: (method || 'GET').toUpperCase(),
      url,
      headers: headers || {},
      data: body,
      timeout: 15000,
      validateStatus: () => true,
    };

    const response = await axios(config);
    const safeHeaders = scrubObject(response.headers);

    await logAudit({
      action: 'headless.api_test.executed',
      targetType: 'HeadlessApiTest',
      targetId: url,
      outcome: 'success',
      context: { method, url, status: response.status },
      actorType: 'admin',
      actorId: null,
    });

    return res.json({
      status: response.status,
      statusText: response.statusText,
      headers: safeHeaders,
      data: response.data,
    });
  } catch (error) {
    console.error('[HeadlessCollections] executeCollectionsApiTest error:', error);
    return res.status(500).json({ error: error.message || 'API test failed' });
  }
};

exports.listTokens = async (req, res) => {
  try {
    const tokens = await listApiTokens();
    return res.json({ tokens });
  } catch (error) {
    console.error('[HeadlessCollections] listTokens error:', error);
    return res.status(500).json({ error: error.message || 'Failed to list tokens' });
  }
};

exports.getToken = async (req, res) => {
  try {
    const token = await getApiTokenById(req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    return res.json({ token });
  } catch (error) {
    console.error('[HeadlessCollections] getToken error:', error);
    return res.status(500).json({ error: error.message || 'Failed to get token' });
  }
};

exports.createToken = async (req, res) => {
  try {
    const body = req.body || {};
    const token = await createApiToken(body);
    return res.status(201).json({ token });
  } catch (error) {
    console.error('[HeadlessCollections] createToken error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create token' });
  }
};

exports.updateToken = async (req, res) => {
  try {
    const token = await updateApiToken(req.params.id, req.body || {});
    if (!token) return res.status(404).json({ error: 'Token not found' });
    return res.json({ token });
  } catch (error) {
    console.error('[HeadlessCollections] updateToken error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update token' });
  }
};

exports.deleteToken = async (req, res) => {
  try {
    await deleteApiToken(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    console.error('[HeadlessCollections] deleteToken error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete token' });
  }
};
