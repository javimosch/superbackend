const express = require('express');

const { adminSessionAuth } = require('../middleware/auth');
const controller = require('../controllers/adminPlugins.controller');

const router = express.Router();

router.use(adminSessionAuth);

router.get('/', controller.list);
router.post('/:id/enable', controller.enable);
router.post('/:id/disable', controller.disable);
router.post('/:id/install', controller.install);

module.exports = router;
