const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/user.controller');

// Profile management
router.put('/profile', authenticate, userController.updateProfile);

// Password management
router.put('/password', authenticate, userController.changePassword);
router.post('/password-reset-request', userController.requestPasswordReset);
router.post('/password-reset-confirm', userController.confirmPasswordReset);

// Account deletion
router.delete('/account', authenticate, userController.deleteAccount);

// Settings
router.get('/settings', authenticate, userController.getSettings);
router.put('/settings', authenticate, userController.updateSettings);

module.exports = router;
