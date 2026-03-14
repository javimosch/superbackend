const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  clerkUserId: {
    type: String,
    sparse: true
  },
  passwordHash: {
    type: String,
    required: function () {
      // Password is optional for OAuth users (GitHub, Clerk)
      return !this.clerkUserId && !this.githubId;
    }
  },
  name: {
    type: String,
    trim: true
  },

  // GitHub OAuth Integration
  githubId: {
    type: String,
    sparse: true
  },
  githubUsername: {
    type: String,
    sparse: true
  },
  githubAccessToken: {
    type: String,
    select: false // Don't return by default
  },
  githubRefreshToken: {
    type: String,
    select: false // Don't return by default
  },
  githubEmail: {
    type: String,
    sparse: true
  },
  avatar: {
    type: String
  },
  emailVerified: {
    type: Boolean,
    default: false
  },

  subscriptionStatus: {
    type: String,
    enum: ['none', 'active', 'cancelled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid'],
    default: 'none'
  },
  stripeCustomerId: {
    type: String,
    sparse: true
  },
  stripeSubscriptionId: {
    type: String,
    sparse: true
  },
  currentPlan: {
    type: String,
    default: 'free',
    trim: true
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  passwordResetToken: {
    type: String,
    sparse: true
  },
  passwordResetExpiry: {
    type: Date
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'superadmin', 'limited-admin', 'content-manager', 'developer'],
    default: 'user'
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ githubId: 1 });
userSchema.index({ clerkUserId: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Clean up response
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.githubAccessToken;
  delete obj.githubRefreshToken;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);