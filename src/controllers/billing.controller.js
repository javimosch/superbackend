const User = require("../models/User");
const StripeWebhookEvent = require("../models/StripeWebhookEvent");
const asyncHandler = require("../utils/asyncHandler");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Create Stripe Checkout Session
const createCheckoutSession = asyncHandler(async (req, res) => {
  const { priceId } = req.body;
  const userId = req.user._id;

  if (!priceId) {
    return res.status(400).json({ error: "priceId is required" });
  }

  // Get or create Stripe customer
  let customerId = req.user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: req.user.email,
      metadata: { userId: userId.toString() },
    });
    customerId = customer.id;
    req.user.stripeCustomerId = customerId;
    await req.user.save();
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/?checkout=success`,
    cancel_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/pricing?checkout=cancelled`,
    metadata: { userId: userId.toString() },
  });

  res.json({ sessionId: session.id, url: session.url });
});

// Create Stripe Customer Portal Session
const createPortalSession = asyncHandler(async (req, res) => {
  const customerId = req.user.stripeCustomerId;

  if (!customerId) {
    return res.status(400).json({ error: "No Stripe customer found" });
  }

  const session = await stripe.billingPortal.sessions.create({
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
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  let webhookEventDoc;
  try {
    // Persist webhook event to database
    webhookEventDoc = new StripeWebhookEvent({
      stripeEventId: event.id,
      eventType: event.type,
      data: event.data.object,
      api_version: event.api_version,
      request: event.request,
      status: "received",
    });
    await webhookEventDoc.save();
  } catch (err) {
    console.error("Error saving webhook event:", err);
    // Continue processing even if save fails
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          user.stripeSubscriptionId = subscription.id;
          user.subscriptionStatus =
            subscription.status === "active" ? "active" : subscription.status;
          await user.save();
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          user.subscriptionStatus = "cancelled";
          await user.save();
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user && user.subscriptionStatus !== "active") {
          user.subscriptionStatus = "active";
          await user.save();
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          user.subscriptionStatus = "past_due";
          await user.save();
        }
        break;
      }
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
      webhookEventDoc.processingErrors.push(err.message);
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
  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    limit: 1,
  });

  if (subscriptions.data.length > 0) {
    const subscription = subscriptions.data[0];
    user.stripeSubscriptionId = subscription.id;
    user.subscriptionStatus =
      subscription.status === "active" ? "active" : subscription.status;
    await user.save();
  } else {
    user.subscriptionStatus = "none";
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
