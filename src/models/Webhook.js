const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
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
      'audit.event'
    ]
  }],
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'failed'],
    default: 'active'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Webhook', webhookSchema);
