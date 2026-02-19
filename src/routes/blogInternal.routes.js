const express = require('express');
const router = express.Router();

const controller = require('../controllers/blogInternal.controller');
const { adminSessionAuth } = require('../middleware/auth');
const rateLimiter = require('../services/rateLimiter.service');

router.use(express.json({ limit: '1mb' }));
router.use(adminSessionAuth);

router.post('/blog/automation/run', rateLimiter.limit('blogAiLimiter'), controller.runAutomation);
router.post('/blog/publish-scheduled/run', controller.publishScheduled);

module.exports = router;
