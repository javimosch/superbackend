const mongoose = require('mongoose');

const rateLimitCounterSchema = new mongoose.Schema(
  {
    limiterId: { type: String, required: true, index: true },
    identityKey: { type: String, required: true, index: true },
    windowStart: { type: Date, required: true, index: true },

    count: { type: Number, default: 0 },

    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: 'rate_limit_counters' },
);

rateLimitCounterSchema.index({ limiterId: 1, identityKey: 1, windowStart: 1 }, { unique: true });
rateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.RateLimitCounter || mongoose.model('RateLimitCounter', rateLimitCounterSchema);
