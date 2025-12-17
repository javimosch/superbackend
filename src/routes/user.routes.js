const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/user.controller');
const { auditMiddleware } = require('../services/auditLogger');

// Profile management
router.put('/profile', authenticate, auditMiddleware('user.profile.update', { entityType: 'User' }), userController.updateProfile);

// Password management
router.put('/password', authenticate, auditMiddleware('user.password.change', { entityType: 'User' }), userController.changePassword);
router.post('/password-reset-request', auditMiddleware('user.password_reset.request', { entityType: 'User' }), userController.requestPasswordReset);
router.post('/password-reset-confirm', auditMiddleware('user.password_reset.confirm', { entityType: 'User' }), userController.confirmPasswordReset);

// Account deletion
router.delete('/account', authenticate, auditMiddleware('user.account.delete', { entityType: 'User' }), userController.deleteAccount);

// Settings
router.get('/settings', authenticate, auditMiddleware('user.settings.get', { entityType: 'User' }), userController.getSettings);
router.put('/settings', authenticate, auditMiddleware('user.settings.update', { entityType: 'User' }), userController.updateSettings);

module.exports = router;
