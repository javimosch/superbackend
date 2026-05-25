const User = require("../models/User");
const StripeWebhookEvent = require("../models/StripeWebhookEvent");
const asyncHandler = require("../utils/asyncHandler");
let stripeInstance;
function getStripe() {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn('[BillingController] STRIPE_SECRET_KEY not set. Stripe features will fail.');
    }
    stripeInstance = require("stripe")(process.env.STRIPE_SECRET_KEY || "sk-missing");
  }
  return stripeInstance;
}
const stripeService = require("../services/stripe.service");

// Create Stripe Checkout Session
const createCheckoutSession = asyncHandler(async (req, res) => {
  const { priceId, billingMode } = req.body;
  const userId = req.user._id;

  if (!priceId) {
    return res.status(400).json({ error: "priceId is required" });
  }

  // Get or create Stripe customer
  let customerId = req.user.stripeCustomerId;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: req.user.email,
      metadata: { userId: userId.toString() },
    });
    customerId = customer.id;
    req.user.stripeCustomerId = customerId;
    await req.user.save();
  }

  const mode = billingMode === "payment" ? "payment" : "subscription";

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/?checkout=success`,
    cancel_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/?checkout=cancelled`,
    metadata: {
      userId: userId.toString(),
      billingMode: mode,
    },
  });

  res.json({ sessionId: session.id, url: session.url });
});

// Create Stripe Customer Portal Session
const createPortalSession = asyncHandler(async (req, res) => {
  const customerId = req.user.stripeCustomerId;

  if (!customerId) {
    return res.status(400).json({ error: "No Stripe customer found" });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}${process.env.BILLING_RETURN_URL_RELATIVE || "/settings/billing"}`,
  });

  res.json({ url: session.url });
});

// Stripe Webhook Handler
const handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  let webhookEventDoc;
  try {
    // Check if webhook event already exists
    const existingEvent = await StripeWebhookEvent.findOne({ stripeEventId: event.id });
    if (existingEvent) {
      console.log(`Webhook event ${event.id} already processed with status: ${existingEvent.status}`);
      return res.json({ received: true, status: 'duplicate' });
    }

    // Persist webhook event to database
    webhookEventDoc = new StripeWebhookEvent({
      stripeEventId: event.id,
      eventType: event.type,
      data: event.data.object,
      previousAttributes: event.data.previous_attributes,
      api_version: event.api_version,
      request: event.request,
      status: "received",
    });
    await webhookEventDoc.save();
  } catch (err) {
    console.error("Error saving webhook event:", err);
    // If it's a duplicate key error, the event was already processed
    if (err.code === 11000) {
      return res.json({ received: true, status: 'duplicate' });
    }
    // Continue processing for other errors
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await stripeService.handleCheckoutSessionCompleted(event.data.object);
        break;
      
      case "customer.subscription.created":
        await stripeService.handleSubscriptionCreated(event.data.object);
        break;
      
      case "customer.subscription.updated":
        await stripeService.handleSubscriptionUpdated(
          event.data.object,
          event.data.previous_attributes
        );
        break;
      
      case "customer.subscription.deleted":
        await stripeService.handleSubscriptionDeleted(event.data.object);
        break;
      
      case "invoice.payment_succeeded":
        await stripeService.handleInvoicePaymentSucceeded(event.data.object);
        break;
      
      case "invoice.payment_failed":
        await stripeService.handleInvoicePaymentFailed(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Update webhook event status to processed
    if (webhookEventDoc) {
      webhookEventDoc.status = "processed";
      webhookEventDoc.processedAt = new Date();
      await webhookEventDoc.save();
    }
  } catch (err) {
    console.error("Error processing webhook:", err);

    // Update webhook event status to failed
    if (webhookEventDoc) {
      webhookEventDoc.status = "failed";
      webhookEventDoc.retryCount = (webhookEventDoc.retryCount || 0) + 1;
      webhookEventDoc.processingErrors.push({
        message: err.message,
        timestamp: new Date()
      });
      await webhookEventDoc.save();
    }

    return res.status(500).json({ error: "Webhook processing failed" });
  }

  res.json({ received: true });
};

// Reconcile subscription for user
const reconcileSubscription = asyncHandler(async (req, res) => {
  const user = req.user;

  if (!user.stripeCustomerId) {
    return res.json({ status: "success", message: "No Stripe customer found" });
  }

  // Fetch latest subscription from Stripe
  const subscriptions = await getStripe().subscriptions.list({
    customer: user.stripeCustomerId,
    limit: 1,
  });

  if (subscriptions.data.length > 0) {
    const subscription = subscriptions.data[0];
    user.stripeSubscriptionId = subscription.id;
    // Map Stripe subscription status to our schema
    const statusMapping = {
      'active': 'active',
      'past_due': 'past_due',
      'unpaid': 'unpaid',
      'canceled': 'cancelled',
      'incomplete': 'incomplete',
      'incomplete_expired': 'incomplete_expired',
      'trialing': 'trialing'
    };
    user.subscriptionStatus = statusMapping[subscription.status] || subscription.status;
    await user.save();
  } else {
    // No active subscription found. Check for successful one-off (payment) checkouts
    const sessions = await getStripe().checkout.sessions.list({
      customer: user.stripeCustomerId,
      limit: 10,
    });

    const lifetimeSession = sessions.data.find((session) => {
      const mode = session.metadata?.billingMode || session.mode;
      return (
        mode === "payment" &&
        session.payment_status === "paid"
      );
    });

    if (lifetimeSession) {
      user.subscriptionStatus = "active";
    } else {
      user.subscriptionStatus = "none";
    }

    await user.save();
  }

  res.json({ status: "success", subscriptionStatus: user.subscriptionStatus });
});

module.exports = {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  reconcileSubscription,
};
