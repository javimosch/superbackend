const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { basicAuth } = require('../middleware/auth');

// All admin routes protected by basic auth
router.use(basicAuth);

router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.put('/users/:id/subscription', adminController.updateUserSubscription);
router.post('/users/:id/reconcile', adminController.reconcileUser);
router.post('/generate-token', adminController.generateToken);

// Webhook event routes
router.get('/stripe-webhooks', adminController.getWebhookEvents);
router.get('/stripe-webhooks/:id', adminController.getWebhookEvent);

module.exports = router;