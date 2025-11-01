const User = require('../models/User');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const asyncHandler = require('../utils/asyncHandler');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');

// Get all users
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json(users.map(u => u.toJSON()));
});

// Get single user
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user: user.toJSON() });
});

// Update user subscription
const updateUserSubscription = asyncHandler(async (req, res) => {
  const { subscriptionStatus } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (subscriptionStatus) {
    user.subscriptionStatus = subscriptionStatus;
  }

  await user.save();

  res.json({ user: user.toJSON() });
});

// Reconcile user subscription
const reconcileUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.stripeCustomerId) {
    return res.json({ status: 'success', message: 'No Stripe customer found' });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    limit: 1
  });

  if (subscriptions.data.length > 0) {
    const subscription = subscriptions.data[0];
    user.stripeSubscriptionId = subscription.id;
    user.subscriptionStatus = subscription.status === 'active' ? 'active' : subscription.status;
    await user.save();
  } else {
    user.subscriptionStatus = 'none';
    await user.save();
  }

  res.json({ status: 'success', user: user.toJSON() });
});

// Generate JWT for testing
const generateToken = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const token = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  res.json({ token, refreshToken, userId: user._id });
});

// Get all webhook events
const getWebhookEvents = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, eventType, status } = req.query;
  
  const filter = {};
  if (eventType) filter.eventType = eventType;
  if (status) filter.status = status;

  const events = await StripeWebhookEvent.find(filter)
    .sort({ receivedAt: -1 })
    .skip(parseInt(offset))
    .limit(parseInt(limit));

  const total = await StripeWebhookEvent.countDocuments(filter);

  res.json({
    events,
    pagination: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  });
});

// Get single webhook event
const getWebhookEvent = asyncHandler(async (req, res) => {
  const event = await StripeWebhookEvent.findOne({ stripeEventId: req.params.id });
  
  if (!event) {
    return res.status(404).json({ error: 'Webhook event not found' });
  }

  res.json({ event });
});

module.exports = {
  getUsers,
  getUser,
  updateUserSubscription,
  reconcileUser,
  generateToken,
  getWebhookEvents,
  getWebhookEvent
};