const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metrics.controller');
const asyncHandler = require('../utils/asyncHandler');
const rateLimiter = require('../services/rateLimiter.service');

// Add rate limiting to prevent abuse
router.post('/track', rateLimiter.limit('metricsTrackLimiter'), asyncHandler(metricsController.track));
router.get('/impact', rateLimiter.limit('metricsImpactLimiter'), asyncHandler(metricsController.getImpact));

module.exports = router;
