const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminCache.controller');

router.use(basicAuth);

router.get('/config', controller.getConfig);
router.put('/config', controller.updateConfig);

router.get('/keys', controller.listKeys);
router.get('/entry', controller.getEntry);
router.put('/entry', controller.setEntry);
router.delete('/entry', controller.deleteEntry);

router.post('/clear', controller.clearCache);
router.get('/metrics', controller.metrics);

module.exports = router;
