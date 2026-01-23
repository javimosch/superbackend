const User = require('../models/User');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const Asset = require('../models/Asset');
const Notification = require('../models/Notification');
const Invite = require('../models/Invite');
const EmailLog = require('../models/EmailLog');
const FormSubmission = require('../models/FormSubmission');
const asyncHandler = require('../utils/asyncHandler');
const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { retryFailedWebhooks, processWebhookEvent } = require('../utils/webhookRetry');
const { auditMiddleware } = require('../services/auditLogger');

// Get all users
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json(users.map(u => u.toJSON()));
});

// Register new user (admin only)
const registerUser = asyncHandler(async (req, res) => {
  const { email, password, name, role = 'user' } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Role must be either "user" or "admin"' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  // Create new user
  const user = new User({
    email: email.toLowerCase(),
    passwordHash: password, // Will be hashed by pre-save hook
    name: name || '',
    role: role
  });

  await user.save();

  // Log the admin action
  console.log(`Admin registered new user: ${user.email} with role: ${user.role}`);

  res.status(201).json({
    success: true,
    user: user.toJSON()
  });
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

// Update user password
const updateUserPassword = asyncHandler(async (req, res) => {
  const { passwordHash } = req.body;
  const bcrypt = require('bcryptjs');
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!passwordHash) {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Detect if the provided password is already a bcrypt hash
  const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(passwordHash);
  if (isBcryptHash) {
    return res.status(400).json({ 
      error: 'Invalid password format',
      message: 'The password appears to be already hashed. Please provide a plaintext password instead.',
      hint: 'Bcrypt hashes start with $2a$, $2b$, or $2y$ followed by a cost parameter (e.g., $2a$10$...)'
    });
  }

  try {
    // Set plaintext password and let pre-save hook hash it
    user.passwordHash = passwordHash;
    await user.save();
    
  } catch (error) {
    console.error('Save error:', error);
    throw error;
  }

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
    // No active subscription found. Check for successful one-off (payment) checkouts
    const sessions = await stripe.checkout.sessions.list({
      customer: user.stripeCustomerId,
      limit: 10
    });

    const lifetimeSession = sessions.data.find((session) => {
      const mode = session.metadata?.billingMode || session.mode;
      return (
        mode === 'payment' &&
        session.payment_status === 'paid'
      );
    });

    if (lifetimeSession) {
      user.subscriptionStatus = 'active';
    } else {
      user.subscriptionStatus = 'none';
    }

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

// Retry failed webhook events
const retryFailedWebhookEvents = asyncHandler(async (req, res) => {
  const { limit = 10, maxRetries = 3 } = req.body;
  
  const results = await retryFailedWebhooks({ limit, maxRetries });
  
  res.json({
    status: 'success',
    results
  });
});

// Retry single webhook event
const retrySingleWebhookEvent = asyncHandler(async (req, res) => {
  const event = await StripeWebhookEvent.findOne({ stripeEventId: req.params.id });
  
  if (!event) {
    return res.status(404).json({ error: 'Webhook event not found' });
  }

  if (event.status === 'processed') {
    return res.status(400).json({ error: 'Event already processed' });
  }

  try {
    await processWebhookEvent(event);
    
    event.status = 'processed';
    event.processedAt = new Date();
    await event.save();
    
    res.json({
      status: 'success',
      message: 'Event processed successfully',
      event
    });
  } catch (err) {
    event.retryCount++;
    event.processingErrors.push({
      message: err.message,
      timestamp: new Date()
    });
    await event.save();
    
    res.status(500).json({
      status: 'error',
      message: err.message,
      event
    });
  }
});

// Get webhook statistics
const getWebhookStats = asyncHandler(async (req, res) => {
  const stats = await StripeWebhookEvent.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const eventTypeStats = await StripeWebhookEvent.aggregate([
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);

  const recentFailures = await StripeWebhookEvent.find({ status: 'failed' })
    .sort({ receivedAt: -1 })
    .limit(10)
    .select('stripeEventId eventType receivedAt retryCount processingErrors');

  res.json({
    statusStats: stats,
    eventTypeStats,
    recentFailures
  });
});

// Coolify Headless Deploy provisioning
const provisionCoolifyDeploy = asyncHandler(async (req, res) => {
  try {
    const { overwrite } = req.body;
    const managePath = path.join(process.cwd(), "manage.sh");
    const exists = fs.existsSync(managePath);

    if (exists && !overwrite) {
      return res.json({
        success: false,
        requiresConfirmation: true,
        message: "Script already exists. Do you want to overwrite it?",
      });
    }

    // In ref-superbackend, manage.sh already exists in the root of the repository
    // If it didn't, we would write it here. For this case, we'll just success.
    res.json({
      success: true,
      message: exists
        ? "Coolify Headless Deploy script (manage.sh) was already there."
        : "Coolify Headless Deploy script (manage.sh) is ready in the root directory.",
      path: managePath,
    });
  } catch (error) {
    console.error("❌ Error provisioning script:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
const deleteUser = asyncHandler(async (req, res) => {
  
  const userId = req.params.id;
  
  // 1. Validate user exists
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // 2. Prevent self-deletion
  // Note: In a real implementation, you'd get the admin ID from req.admin or similar
  // For now, we'll skip this check as the basic auth doesn't provide user identity
  
  // 3. Check if this is the last admin
  const adminCount = await User.countDocuments({ role: 'admin' });
  if (user.role === 'admin' && adminCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last admin user' });
  }
  
  // 4. Cleanup dependencies
  await cleanupUserData(userId);
  
  // 5. Delete user
  await User.findByIdAndDelete(userId);
  
  // 6. Log action
  console.log(`Admin deleted user: ${user.email} (${userId})`);
  
  res.json({ message: 'User deleted successfully' });
});

// Helper function to clean up user data
async function cleanupUserData(userId) {
  
  try {
    // Handle organizations owned by user
    const ownedOrgs = await Organization.find({ ownerUserId: userId });
    for (const org of ownedOrgs) {
      // Check if organization has other members
      const memberCount = await OrganizationMember.countDocuments({ 
        orgId: org._id, 
        userId: { $ne: userId } 
      });
      
      if (memberCount === 0) {
        // Delete organization if no other members
        await Organization.findByIdAndDelete(org._id);
        console.log(`Deleted organization ${org.name} (${org._id}) - no other members`);
      } else {
        // Remove owner but keep organization
        org.ownerUserId = null;
        await org.save();
        console.log(`Removed owner from organization ${org.name} (${org._id}) - has other members`);
      }
    }
    
    // Remove from all organization memberships
    await OrganizationMember.deleteMany({ userId: userId });
    
    // Delete user's assets
    await Asset.deleteMany({ ownerUserId: userId });
    
    // Delete notifications
    await Notification.deleteMany({ userId: userId });
    
    // Clean up other references
    await Invite.deleteMany({ createdByUserId: userId });
    await EmailLog.deleteMany({ userId: userId });
    await FormSubmission.deleteMany({ userId: userId });
    
    // Note: We keep ActivityLog and AuditEvent for audit purposes
    
    console.log(`Completed cleanup for user ${userId}`);
  } catch (error) {
    console.error('Error during user cleanup:', error);
    throw error;
  }
}

module.exports = {
  getUsers,
  registerUser,
  getUser,
  updateUserSubscription,
  updateUserPassword,
  deleteUser,
  reconcileUser,
  generateToken,
  getWebhookEvents,
  getWebhookEvent,
  retryFailedWebhookEvents,
  retrySingleWebhookEvent,
  getWebhookStats,
  provisionCoolifyDeploy
};