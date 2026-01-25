const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/blogAutomationAdmin.controller');

router.use(basicAuth);
router.use(express.json({ limit: '2mb' }));

router.get('/blog-automation/config', controller.getConfig);
router.put('/blog-automation/config', controller.saveConfig);

router.get('/blog-automation/configs', controller.listConfigs);
router.post('/blog-automation/configs', controller.createConfig);
router.get('/blog-automation/configs/:id', controller.getConfigById);
router.post('/blog-automation/configs/:id/preview-prompts', controller.previewPromptsByConfigId);
router.put('/blog-automation/configs/:id', controller.updateConfigById);
router.delete('/blog-automation/configs/:id', controller.deleteConfigById);

router.get('/blog-automation/style-guide', controller.getStyleGuide);
router.put('/blog-automation/style-guide', controller.saveStyleGuide);

router.get('/blog-automation/runs', controller.listRuns);
router.post('/blog-automation/run-now', controller.runNow);

module.exports = router;
