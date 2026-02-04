const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    index: true,
    default: () => `Webhook-${require('crypto').randomBytes(4).toString('hex')}`
  },
  targetUrl: {
    type: String,
    required: true,
    trim: true
  },
  secret: {
    type: String,
    required: true,
    default: () => require('crypto').randomBytes(32).toString('hex')
  },
  events: [{
    type: String,
    required: true,
    enum: [
      'user.login',
      'user.registered',
      'organization.updated',
      'member.added',
      'form.submitted',
      'experiment.winner_changed',
      'experiment.status_changed',
      'audit.event'
    ]
  }],
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: false,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'failed'],
    default: 'active'
  },
  timeout: {
    type: Number,
    default: 5000, // 5 seconds default
    min: 1000,
    max: 30000 // 30 seconds max
  },
  isAsync: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

webhookSchema.index({ name: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model('Webhook', webhookSchema);
