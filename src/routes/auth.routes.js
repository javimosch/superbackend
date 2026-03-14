const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { auditMiddleware } = require('../services/auditLogger');

// Email/Password Auth
router.post('/register', auditMiddleware('public.auth.register', { entityType: 'User' }), authController.register);
router.post('/login', auditMiddleware('public.auth.login', { entityType: 'User' }), authController.login);
router.post('/refresh-token', auditMiddleware('public.auth.refresh', { entityType: 'User' }), authController.refresh);
router.get('/me', authenticate, authController.me);

// GitHub OAuth Auth
router.get('/github', auditMiddleware('public.auth.github.init', { entityType: 'User' }), authController.githubLogin);
router.get('/github/callback', auditMiddleware('public.auth.github.callback', { entityType: 'User' }), authController.githubCallback);
router.post('/github/refresh-token', auditMiddleware('public.auth.github.refresh', { entityType: 'User' }), authController.githubRefreshToken);

module.exports = router;