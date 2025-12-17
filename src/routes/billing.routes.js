const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billing.controller');
const { authenticate } = require('../middleware/auth');
const { auditMiddleware } = require('../services/auditLogger');

router.post('/create-checkout-session', authenticate, auditMiddleware('user.billing.checkout_session.create', { entityType: 'StripeCheckoutSession' }), billingController.createCheckoutSession);
router.post('/create-portal-session', authenticate, auditMiddleware('user.billing.portal_session.create', { entityType: 'StripePortalSession' }), billingController.createPortalSession);
router.post('/reconcile-subscription', authenticate, auditMiddleware('user.billing.subscription.reconcile', { entityType: 'Subscription' }), billingController.reconcileSubscription);

module.exports = router;