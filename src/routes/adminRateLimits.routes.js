const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const adminRateLimitsController = require('../controllers/adminRateLimits.controller');

router.get('/', adminSessionAuth, adminRateLimitsController.list);
router.get('/config', adminSessionAuth, adminRateLimitsController.getConfig);
router.put('/config', adminSessionAuth, adminRateLimitsController.updateConfig);
router.get('/metrics', adminSessionAuth, adminRateLimitsController.getMetrics);

router.post('/bulk-enabled', adminSessionAuth, adminRateLimitsController.bulkEnabled);

router.put('/:id', adminSessionAuth, adminRateLimitsController.updateLimiter);
router.post('/:id/reset', adminSessionAuth, adminRateLimitsController.resetLimiter);

module.exports = router;
