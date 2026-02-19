const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const rateLimiter = require('../services/rateLimiter.service');

const controller = require('../controllers/internalExperiments.controller');

router.use(express.json({ limit: '1mb' }));
router.use(adminSessionAuth);

router.post('/experiments/aggregate/run', rateLimiter.limit('experimentsInternalAggLimiter'), controller.runAggregation);
router.post('/experiments/retention/run', rateLimiter.limit('experimentsInternalRetentionLimiter'), controller.runRetention);

module.exports = router;
