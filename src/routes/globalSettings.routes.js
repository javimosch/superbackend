const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const globalSettingsController = require('../controllers/globalSettings.controller');

// Public route (no auth)
router.get('/public', globalSettingsController.getPublicSettings);

// Protected routes (Session + Basic Auth fallback)
router.get('/', adminAuth, globalSettingsController.getAllSettings);
// more specific path before :key catch-all
router.get('/:key/reveal', adminAuth, globalSettingsController.revealSetting);
router.get('/:key', adminAuth, globalSettingsController.getSetting);
router.put('/:key', adminAuth, globalSettingsController.updateSetting);
router.post('/', adminAuth, globalSettingsController.createSetting);
router.delete('/:key', adminAuth, globalSettingsController.deleteSetting);

module.exports = router;
