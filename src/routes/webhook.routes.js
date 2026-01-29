const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');
const authMiddleware = require('../middleware/auth');
const orgMiddleware = require('../middleware/org');
const rateLimiter = require('../services/rateLimiter.service');

// Webhook routes support both User (JWT) and SuperAdmin (Basic Auth)
router.use((req, res, next) => {
  // If already authenticated via Basic Auth (SuperAdmin), skip JWT check
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    return authMiddleware.basicAuth(req, res, next);
  }
  // Otherwise require JWT
  authMiddleware.authenticate(req, res, next);
});

// Optional organization context: required for non-admins
router.use((req, res, next) => {
  const isBasicAuth = req.headers.authorization?.startsWith('Basic ');
  if (isBasicAuth) return next();
  orgMiddleware.loadOrgContext(req, res, next);
});

router.get('/', webhookController.getAll);
router.post('/', webhookController.create);
router.patch('/:id', webhookController.update);
router.get('/:id/history', webhookController.getHistory);
router.delete('/:id', webhookController.delete);
router.post('/:id/test', rateLimiter.limit('webhookTestLimiter'), webhookController.test);

module.exports = router;
