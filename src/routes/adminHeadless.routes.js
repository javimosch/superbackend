const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const adminHeadlessController = require('../controllers/adminHeadless.controller');
const rateLimiter = require('../services/rateLimiter.service');

router.use(adminSessionAuth);

// Models
router.get('/models', adminHeadlessController.listModels);
router.get('/models/:codeIdentifier', adminHeadlessController.getModel);
router.post('/models', adminHeadlessController.createModel);
router.put('/models/:codeIdentifier', adminHeadlessController.updateModel);
router.delete('/models/:codeIdentifier', adminHeadlessController.deleteModel);

// External models (Mongo collections)
router.get('/external/collections', adminHeadlessController.listExternalCollections);
router.post('/external/infer', adminHeadlessController.inferExternalCollection);
router.post('/external/import', adminHeadlessController.importExternalModel);
router.post('/models/:codeIdentifier/sync', adminHeadlessController.syncExternalModel);

// Advanced JSON / bulk helpers
router.post('/models/validate', adminHeadlessController.validateModelDefinition);
router.post('/models/apply', adminHeadlessController.applyModelProposal);

// AI model builder
router.post('/ai/model-builder/chat', rateLimiter.limit('aiOperationsLimiter'), adminHeadlessController.aiModelBuilderChat);

// Admin collections CRUD (UI)
router.get('/collections/:modelCode', adminHeadlessController.listCollectionItems);
router.post('/collections/:modelCode', adminHeadlessController.createCollectionItem);
router.put('/collections/:modelCode/:id', adminHeadlessController.updateCollectionItem);
router.delete('/collections/:modelCode/:id', adminHeadlessController.deleteCollectionItem);

router.post('/collections-api-test', adminHeadlessController.executeCollectionsApiTest);

// API tokens
router.get('/tokens', adminHeadlessController.listTokens);
router.get('/tokens/:id', adminHeadlessController.getToken);
router.post('/tokens', adminHeadlessController.createToken);
router.put('/tokens/:id', adminHeadlessController.updateToken);
router.delete('/tokens/:id', adminHeadlessController.deleteToken);

module.exports = router;
