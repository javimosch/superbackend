const {
  listModelDefinitions,
  getModelDefinitionByCode,
  createModelDefinition,
  updateModelDefinition,
  disableModelDefinition,
  getDynamicModel,
} = require('../services/headlessModels.service');

const {
  listExternalCollections,
  inferExternalModelFromCollection,
  createOrUpdateExternalModel,
} = require('../services/headlessExternalModels.service');

const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const axios = require('axios');
const { logAudit, scrubObject } = require('../services/auditLogger');

function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return res.status(400).json({ error: msg });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: msg });
  if (code === 'CONFLICT') return res.status(409).json({ error: msg });
  return res.status(500).json({ error: msg });
}

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'CONFLICT') return { status: 409, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function buildLoopbackBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${process.env.PORT || 3000}`;
  return `${proto}://${host}`;
}

function safeJsonParse(str) {
  try {
    return JSON.parse(String(str));
  } catch {
    return null;
  }
}

function sanitizeAndTruncateMeta(obj, maxBytes) {
  if (obj === null || obj === undefined) return { value: obj, truncated: false };
  try {
    const str = JSON.stringify(obj);
    if (str.length <= maxBytes) return { value: obj, truncated: false };
    return { value: JSON.parse(str.substring(0, maxBytes)) + '...', truncated: true };
  } catch {
    return { value: obj, truncated: false };
  }
}

// ===== Model CRUD =====

exports.listModels = async (req, res) => {
  try {
    const models = await listModelDefinitions();
    return res.json({ models: models || [] });
  } catch (error) {
    console.error('Error listing headless models:', error);
    return handleServiceError(res, error);
  }
};

exports.getModel = async (req, res) => {
  try {
    const model = await getModelDefinitionByCode(req.params.codeIdentifier);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    return res.json({ model });
  } catch (error) {
    console.error('Error fetching headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.createModel = async (req, res) => {
  try {
    const body = req.body || {};
    const model = await createModelDefinition(body);
    await createAuditEvent({
      ...getBasicAuthActor(req),
      action: 'headless.model.create',
      entityType: 'HeadlessModelDefinition',
      entityId: String(model._id),
      before: null,
      after: { codeIdentifier: body.codeIdentifier },
      meta: null,
    });
    return res.status(201).json({ model });
  } catch (error) {
    console.error('Error creating headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.updateModel = async (req, res) => {
  try {
    const model = await updateModelDefinition(req.params.codeIdentifier, req.body || {});
    if (!model) return res.status(404).json({ error: 'Model not found' });
    return res.json({ model });
  } catch (error) {
    console.error('Error updating headless model:', error);
    return handleServiceError(res, error);
  }
};

exports.deleteModel = async (req, res) => {
  try {
    const { codeIdentifier } = req.params;
    await disableModelDefinition(codeIdentifier);
    await createAuditEvent({
      ...getBasicAuthActor(req),
      action: 'headless.model.disable',
      entityType: 'HeadlessModelDefinition',
      entityId: codeIdentifier,
      before: null,
      after: null,
      meta: null,
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error disabling headless model:', error);
    return handleServiceError(res, error);
  }
};

// ===== External Collections =====

exports.listExternalCollections = async (req, res) => {
  try {
    const cols = await listExternalCollections();
    return res.json({ collections: cols || [] });
  } catch (error) {
    console.error('Error listing external collections:', error);
    return handleServiceError(res, error);
  }
};

exports.inferExternalCollection = async (req, res) => {
  try {
    const { collectionName, sampleSize } = req.body || {};
    if (!collectionName) return res.status(400).json({ error: 'collectionName is required' });
    const result = await inferExternalModelFromCollection(collectionName, { sampleSize: sampleSize || 3 });
    return res.json(result);
  } catch (error) {
    console.error('Error inferring external collection:', error);
    return handleServiceError(res, error);
  }
};

exports.importExternalModel = async (req, res) => {
  try {
    const { collectionName, codeIdentifier, sampleSize, isActive } = req.body || {};
    if (!collectionName || !codeIdentifier) {
      return res.status(400).json({ error: 'collectionName and codeIdentifier are required' });
    }
    const model = await createOrUpdateExternalModel(collectionName, codeIdentifier, { sampleSize, isActive });
    return res.status(201).json({ model });
  } catch (error) {
    console.error('Error importing external model:', error);
    return handleServiceError(res, error);
  }
};

exports.syncExternalModel = async (req, res) => {
  try {
    const { codeIdentifier } = req.params;
    const model = await getModelDefinitionByCode(codeIdentifier);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const collectionName = model.externalCollectionName || model.codeIdentifier;
    const result = await createOrUpdateExternalModel(collectionName, codeIdentifier, { isActive: model.isActive });
    return res.json({ model: result });
  } catch (error) {
    console.error('Error syncing external model:', error);
    return handleServiceError(res, error);
  }
};

// ===== AI Builder (re-exported) =====
const HeadlessAiController = require('./adminHeadlessAi.controller');
exports.validateModelDefinition = HeadlessAiController.validateModelDefinition;
exports.applyModelProposal = HeadlessAiController.applyModelProposal;
exports.aiModelBuilderChat = HeadlessAiController.aiModelBuilderChat;

// ===== Collections (re-exported) =====
const HeadlessCollectionsController = require('./adminHeadlessCollections.controller');
exports.listCollectionItems = HeadlessCollectionsController.listCollectionItems;
exports.createCollectionItem = HeadlessCollectionsController.createCollectionItem;
exports.updateCollectionItem = HeadlessCollectionsController.updateCollectionItem;
exports.deleteCollectionItem = HeadlessCollectionsController.deleteCollectionItem;
exports.executeCollectionsApiTest = HeadlessCollectionsController.executeCollectionsApiTest;

// ===== API Tokens (re-exported) =====
exports.listTokens = HeadlessCollectionsController.listTokens;
exports.getToken = HeadlessCollectionsController.getToken;
exports.createToken = HeadlessCollectionsController.createToken;
exports.updateToken = HeadlessCollectionsController.updateToken;
exports.deleteToken = HeadlessCollectionsController.deleteToken;
