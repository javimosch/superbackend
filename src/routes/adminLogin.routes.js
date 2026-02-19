const express = require('express');
const router = express.Router();
const adminLoginController = require('../controllers/adminLogin.controller');
const { auditMiddleware } = require('../services/auditLogger');

/**
 * Admin Login Routes
 * Handles both basic auth and IAM authentication through a unified login form
 */

// Serve login page
router.get('/login', auditMiddleware('admin.login.view', { entityType: 'AdminSession' }), adminLoginController.getLogin);

// Process login (supports both basic auth and IAM)
router.post('/login', auditMiddleware('admin.login.attempt', { entityType: 'AdminSession' }), adminLoginController.postLogin);

// Logout and clear session
router.post('/logout', auditMiddleware('admin.logout', { entityType: 'AdminSession' }), adminLoginController.postLogout);

// API endpoint to check authentication status
router.get('/auth-status', adminLoginController.getAuthStatus);

module.exports = router;
