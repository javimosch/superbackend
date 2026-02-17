const express = require('express');

const controller = require('../controllers/registry.controller');
const rateLimiter = require('../services/rateLimiter.service');

const router = express.Router();

router.get('/:id/auth', rateLimiter.limit('openRegistryAuthLimiter'), controller.auth);
router.get('/:id/list', rateLimiter.limit('openRegistryListLimiter'), controller.list);

module.exports = router;
