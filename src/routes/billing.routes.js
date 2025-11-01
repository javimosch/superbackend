const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billing.controller');
const { authenticate } = require('../middleware/auth');

router.post('/create-checkout-session', authenticate, billingController.createCheckoutSession);
router.post('/create-portal-session', authenticate, billingController.createPortalSession);
router.post('/reconcile-subscription', authenticate, billingController.reconcileSubscription);

module.exports = router;