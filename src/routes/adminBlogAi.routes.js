const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/blogAiAdmin.controller');
const rateLimiter = require('../services/rateLimiter.service');

router.use(basicAuth);
router.use(express.json({ limit: '2mb' }));

router.post('/blog-ai/generate-field', rateLimiter.limit('blogAiLimiter'), controller.generateField);
router.post('/blog-ai/generate-all', rateLimiter.limit('blogAiLimiter'), controller.generateAll);
router.post('/blog-ai/format-markdown', rateLimiter.limit('blogAiLimiter'), controller.formatMarkdown);
router.post('/blog-ai/refine-markdown', rateLimiter.limit('blogAiLimiter'), controller.refineMarkdown);

module.exports = router;
