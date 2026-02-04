const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const rateLimiter = require('../services/rateLimiter.service');

const controller = require('../controllers/internalExperiments.controller');

router.use(express.json({ limit: '1mb' }));
router.use(basicAuth);

router.post('/experiments/aggregate/run', rateLimiter.limit('experimentsInternalAggLimiter'), controller.runAggregation);
router.post('/experiments/retention/run', rateLimiter.limit('experimentsInternalRetentionLimiter'), controller.runRetention);

module.exports = router;
