const mongoose = require('mongoose');

const stripeWebhookEventSchema = new mongoose.Schema({
  stripeEventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  data: {
    type: Object,
    required: true
  },
  api_version: {
    type: String
  },
  request: {
    type: Object
  },
  status: {
    type: String,
    enum: ['received', 'processed', 'failed'],
    default: 'received',
    index: true
  },
  processingErrors: [{
    type: String
  }],
  receivedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  processedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('StripeWebhookEvent', stripeWebhookEventSchema);
