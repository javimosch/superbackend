const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { auditMiddleware } = require('../services/auditLogger');

router.post('/register', auditMiddleware('public.auth.register', { entityType: 'User' }), authController.register);
router.post('/login', auditMiddleware('public.auth.login', { entityType: 'User' }), authController.login);
router.post('/refresh-token', auditMiddleware('public.auth.refresh', { entityType: 'User' }), authController.refresh);
router.get('/me', authenticate, authController.me);

module.exports = router;