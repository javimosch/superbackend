const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { adminSessionAuth } = require('../middleware/auth');

// All admin routes protected by session auth
router.use(adminSessionAuth);

router.get('/users', adminController.getUsers);
router.post('/users/register', adminController.registerUser);
router.get('/users/:id', adminController.getUser);
router.put('/users/:id/subscription', adminController.updateUserSubscription);
router.patch('/users/:id', adminController.updateUserPassword);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/:id/reconcile', adminController.reconcileUser);
router.post('/generate-token', adminController.generateToken);

// Coolify Headless Deploy
router.post('/coolify-headless-deploy/provision', adminController.provisionCoolifyDeploy);

// Webhook event routes
router.get('/stripe-webhooks', adminController.getWebhookEvents);
router.get('/stripe-webhooks/:id', adminController.getWebhookEvent);
router.post('/stripe-webhooks/retry', adminController.retryFailedWebhookEvents);
router.post('/stripe-webhooks/:id/retry', adminController.retrySingleWebhookEvent);
router.get('/stripe-webhooks-stats', adminController.getWebhookStats);

router.post('/users/email/token', adminController.generateTokenForEmail);

module.exports = router;