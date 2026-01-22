const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { basicAuth } = require('../middleware/auth');

// All admin routes protected by basic auth
router.use(basicAuth);

router.get('/users', adminController.getUsers);
router.post('/users/register', adminController.registerUser);
router.get('/users/:id', adminController.getUser);
router.put('/users/:id/subscription', adminController.updateUserSubscription);
router.patch('/users/:id', adminController.updateUserPassword);
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

module.exports = router;