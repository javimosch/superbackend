const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const adminSeoConfigController = require('../controllers/adminSeoConfig.controller');
const rateLimiter = require('../services/rateLimiter.service');

router.get('/', adminSessionAuth, adminSeoConfigController.get);
router.put('/', adminSessionAuth, adminSeoConfigController.update);

// SEO Config helpers
router.get('/ai/views', adminSessionAuth, adminSeoConfigController.seoConfigAiListViews);
router.post('/ai/generate-entry', adminSessionAuth, rateLimiter.limit('seoAiLimiter'), adminSeoConfigController.seoConfigAiGenerateEntry);
router.post('/ai/improve-entry', adminSessionAuth, rateLimiter.limit('seoAiLimiter'), adminSeoConfigController.seoConfigAiImproveEntry);
router.post('/pages/apply-entry', adminSessionAuth, adminSeoConfigController.seoConfigApplyEntry);

router.put('/og/svg', adminSessionAuth, adminSeoConfigController.updateOgSvg);
router.post('/og/generate-png', adminSessionAuth, rateLimiter.limit('seoAiLimiter'), adminSeoConfigController.generateOgPng);
router.post('/ai/edit-svg', adminSessionAuth, rateLimiter.limit('seoAiLimiter'), adminSeoConfigController.aiEditSvg);

module.exports = router;
