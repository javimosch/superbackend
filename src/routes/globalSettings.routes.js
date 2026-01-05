const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middleware/auth');
const globalSettingsController = require('../controllers/globalSettings.controller');

// Public route (no auth)
router.get('/public', globalSettingsController.getPublicSettings);

// Protected routes (Basic Auth)
router.get('/', basicAuth, globalSettingsController.getAllSettings);
// more specific path before :key catch-all
router.get('/:key/reveal', basicAuth, globalSettingsController.revealSetting);
router.get('/:key', basicAuth, globalSettingsController.getSetting);
router.put('/:key', basicAuth, globalSettingsController.updateSetting);
router.post('/', basicAuth, globalSettingsController.createSetting);
router.delete('/:key', basicAuth, globalSettingsController.deleteSetting);

module.exports = router;
