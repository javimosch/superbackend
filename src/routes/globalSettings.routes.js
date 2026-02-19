const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const globalSettingsController = require('../controllers/globalSettings.controller');

// Public route (no auth)
router.get('/public', globalSettingsController.getPublicSettings);

// Protected routes (Session Auth)
router.get('/', adminSessionAuth, globalSettingsController.getAllSettings);
// more specific path before :key catch-all
router.get('/:key/reveal', adminSessionAuth, globalSettingsController.revealSetting);
router.get('/:key', adminSessionAuth, globalSettingsController.getSetting);
router.put('/:key', adminSessionAuth, globalSettingsController.updateSetting);
router.post('/', adminSessionAuth, globalSettingsController.createSetting);
router.delete('/:key', adminSessionAuth, globalSettingsController.deleteSetting);

module.exports = router;
