const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const adminFeatureFlagsController = require('../controllers/adminFeatureFlags.controller');

router.get('/', adminSessionAuth, adminFeatureFlagsController.listFlags);
router.get('/:key', adminSessionAuth, adminFeatureFlagsController.getFlag);
router.post('/', adminSessionAuth, adminFeatureFlagsController.createFlag);
router.put('/:key', adminSessionAuth, adminFeatureFlagsController.updateFlag);
router.delete('/:key', adminSessionAuth, adminFeatureFlagsController.deleteFlag);

module.exports = router;
