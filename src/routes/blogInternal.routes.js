const express = require('express');
const router = express.Router();

const controller = require('../controllers/blogInternal.controller');
const { requireInternalCronToken } = require('../middleware/internalCronAuth');
const rateLimiter = require('../services/rateLimiter.service');

router.use(express.json({ limit: '1mb' }));
router.use(requireInternalCronToken);

router.post('/blog/automation/run', rateLimiter.limit('blogAiLimiter'), controller.runAutomation);
router.post('/blog/publish-scheduled/run', controller.publishScheduled);

module.exports = router;
