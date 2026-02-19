const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  clerkUserId: {
    type: String,
    index: true,
    sparse: true
  },
  passwordHash: {
    type: String,
    required: function () {
      return !this.clerkUserId;
    }
  },
  name: {
    type: String,
    trim: true
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
    enum: ['user', 'admin', 'superadmin'],
    default: 'user'
  }
}, {
  timestamps: true
});

// userSchema.index({ email: 1 }); // Removed duplicate index

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
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);