const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/blogAiAdmin.controller');

router.use(basicAuth);
router.use(express.json({ limit: '2mb' }));

router.post('/blog-ai/generate-field', controller.generateField);
router.post('/blog-ai/generate-all', controller.generateAll);
router.post('/blog-ai/format-markdown', controller.formatMarkdown);
router.post('/blog-ai/refine-markdown', controller.refineMarkdown);

module.exports = router;
