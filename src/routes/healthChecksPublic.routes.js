const express = require('express');
const router = express.Router();

const controller = require('../controllers/healthChecksPublic.controller');

router.get('/status', controller.getStatus);
router.get('/status/json', controller.getStatusJson);

module.exports = router;