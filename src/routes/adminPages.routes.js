const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminPages.controller');
const adminBlockDefinitionsController = require('../controllers/adminBlockDefinitions.controller');
const adminBlockDefinitionsAiController = require('../controllers/adminBlockDefinitionsAi.controller');

router.use(basicAuth);

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

router.get('/templates', controller.getAvailableTemplates);
router.get('/layouts', controller.getAvailableLayouts);
router.get('/blocks', controller.getAvailableBlocks);
router.get('/blocks-schema', controller.getBlocksSchema);

router.get('/block-definitions', adminBlockDefinitionsController.list);
router.post('/block-definitions', adminBlockDefinitionsController.create);
router.get('/block-definitions/:code', adminBlockDefinitionsController.get);
router.put('/block-definitions/:code', adminBlockDefinitionsController.update);
router.delete('/block-definitions/:code', adminBlockDefinitionsController.remove);

router.post('/ai/block-definitions/generate', adminBlockDefinitionsAiController.generate);
router.post('/ai/block-definitions/:code/propose', adminBlockDefinitionsAiController.propose);

module.exports = router;
