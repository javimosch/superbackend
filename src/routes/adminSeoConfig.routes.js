const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const adminSeoConfigController = require('../controllers/adminSeoConfig.controller');
const rateLimiter = require('../services/rateLimiter.service');

router.get('/', basicAuth, adminSeoConfigController.get);
router.put('/', basicAuth, adminSeoConfigController.update);

// SEO Config helpers
router.get('/ai/views', basicAuth, adminSeoConfigController.seoConfigAiListViews);
router.post('/ai/generate-entry', basicAuth, rateLimiter.limit('seoAiLimiter'), adminSeoConfigController.seoConfigAiGenerateEntry);
router.post('/ai/improve-entry', basicAuth, rateLimiter.limit('seoAiLimiter'), adminSeoConfigController.seoConfigAiImproveEntry);
router.post('/pages/apply-entry', basicAuth, adminSeoConfigController.seoConfigApplyEntry);

router.put('/og/svg', basicAuth, adminSeoConfigController.updateOgSvg);
router.post('/og/generate-png', basicAuth, rateLimiter.limit('seoAiLimiter'), adminSeoConfigController.generateOgPng);
router.post('/ai/edit-svg', basicAuth, rateLimiter.limit('seoAiLimiter'), adminSeoConfigController.aiEditSvg);

module.exports = router;
