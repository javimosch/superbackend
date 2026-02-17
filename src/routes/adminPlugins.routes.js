const express = require('express');

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminPlugins.controller');

const router = express.Router();

router.use(basicAuth);

router.get('/', controller.list);
router.post('/:id/enable', controller.enable);
router.post('/:id/disable', controller.disable);
router.post('/:id/install', controller.install);

module.exports = router;
