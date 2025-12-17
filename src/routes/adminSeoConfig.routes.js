const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const adminSeoConfigController = require('../controllers/adminSeoConfig.controller');

router.get('/', basicAuth, adminSeoConfigController.get);
router.put('/', basicAuth, adminSeoConfigController.update);
router.put('/og/svg', basicAuth, adminSeoConfigController.updateOgSvg);
router.post('/og/generate-png', basicAuth, adminSeoConfigController.generateOgPng);
router.post('/ai/edit-svg', basicAuth, adminSeoConfigController.aiEditSvg);

module.exports = router;
