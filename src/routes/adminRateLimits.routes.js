const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const adminRateLimitsController = require('../controllers/adminRateLimits.controller');

router.get('/', basicAuth, adminRateLimitsController.list);
router.get('/config', basicAuth, adminRateLimitsController.getConfig);
router.put('/config', basicAuth, adminRateLimitsController.updateConfig);
router.get('/metrics', basicAuth, adminRateLimitsController.getMetrics);

router.post('/bulk-enabled', basicAuth, adminRateLimitsController.bulkEnabled);

router.put('/:id', basicAuth, adminRateLimitsController.updateLimiter);
router.post('/:id/reset', basicAuth, adminRateLimitsController.resetLimiter);

module.exports = router;
