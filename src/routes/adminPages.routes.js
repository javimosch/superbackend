const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const controller = require('../controllers/adminPages.controller');
const adminBlockDefinitionsController = require('../controllers/adminBlockDefinitions.controller');
const adminBlockDefinitionsAiController = require('../controllers/adminBlockDefinitionsAi.controller');
const adminContextBlockDefinitionsController = require('../controllers/adminContextBlockDefinitions.controller');
const adminPagesContextBlocksAiController = require('../controllers/adminPagesContextBlocksAi.controller');
const rateLimiter = require('../services/rateLimiter.service');

router.use(adminSessionAuth);

router.get('/collections', controller.listCollections);
router.get('/collections/:id', controller.getCollection);
router.post('/collections', controller.createCollection);
router.put('/collections/:id', controller.updateCollection);
router.delete('/collections/:id', controller.deleteCollection);

router.get('/pages', controller.listPages);
router.get('/pages/:id', controller.getPage);
router.post('/pages', controller.createPage);
router.put('/pages/:id', controller.updatePage);
router.delete('/pages/:id', controller.deletePage);

router.post('/pages/:id/publish', controller.publishPage);
router.post('/pages/:id/unpublish', controller.unpublishPage);

router.post('/pages/:id/test-context', controller.testPageContextPhase);
router.post('/pages/:id/test-block', controller.testPageContextBlock);
router.post('/test-block', controller.testContextBlockAdhoc);

router.get('/templates', controller.getAvailableTemplates);
router.get('/layouts', controller.getAvailableLayouts);
router.get('/blocks', controller.getAvailableBlocks);
router.get('/blocks-schema', controller.getBlocksSchema);

router.get('/block-definitions', adminBlockDefinitionsController.list);
router.post('/block-definitions', adminBlockDefinitionsController.create);
router.get('/block-definitions/:code', adminBlockDefinitionsController.get);
router.put('/block-definitions/:code', adminBlockDefinitionsController.update);
router.delete('/block-definitions/:code', adminBlockDefinitionsController.remove);

router.get('/context-block-definitions', adminContextBlockDefinitionsController.list);
router.post('/context-block-definitions', adminContextBlockDefinitionsController.create);
router.get('/context-block-definitions/:code', adminContextBlockDefinitionsController.get);
router.put('/context-block-definitions/:code', adminContextBlockDefinitionsController.update);
router.delete('/context-block-definitions/:code', adminContextBlockDefinitionsController.remove);

router.post('/ai/block-definitions/generate', rateLimiter.limit('aiOperationsLimiter'), adminBlockDefinitionsAiController.generate);
router.post('/ai/block-definitions/:code/propose', rateLimiter.limit('aiOperationsLimiter'), adminBlockDefinitionsAiController.propose);

router.post('/ai/context-blocks/generate', rateLimiter.limit('aiOperationsLimiter'), adminPagesContextBlocksAiController.generate);
router.post('/ai/context-blocks/propose', rateLimiter.limit('aiOperationsLimiter'), adminPagesContextBlocksAiController.propose);

module.exports = router;
