const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middleware/auth');

const adminI18nController = require('../controllers/adminI18n.controller');
const rateLimiter = require('../services/rateLimiter.service');

router.use(basicAuth);

router.get('/locales', adminI18nController.listLocales);
router.post('/locales', adminI18nController.createLocale);
router.put('/locales/:code', adminI18nController.updateLocale);

router.get('/entries', adminI18nController.listEntries);
router.post('/entries', adminI18nController.createEntry);
router.put('/entries/:id', adminI18nController.updateEntry);
router.delete('/entries/:id', adminI18nController.deleteEntry);

router.post('/ai/preview', rateLimiter.limit('i18nAiLimiter'), adminI18nController.aiPreview);
router.post('/ai/apply', rateLimiter.limit('i18nAiLimiter'), adminI18nController.aiApply);
router.post('/ai/translate-text', rateLimiter.limit('i18nAiLimiter'), adminI18nController.aiTranslateText);

module.exports = router;
