const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminEjsVirtual.controller');
const rateLimiter = require('../services/rateLimiter.service');

router.use(basicAuth);

router.get('/files', controller.list);
router.get('/file', controller.getFile);
router.put('/file', controller.saveFile);
router.post('/file/revert', controller.revertToDefault);
router.get('/history', controller.listHistory);
router.post('/rollback', controller.rollback);
router.post('/vibe', rateLimiter.limit('aiOperationsLimiter'), controller.vibe);
router.post('/cache/clear', controller.clearCache);

module.exports = router;
