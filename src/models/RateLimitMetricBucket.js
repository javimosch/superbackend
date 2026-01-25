const mongoose = require('mongoose');

const rateLimitMetricBucketSchema = new mongoose.Schema(
  {
    bucketStart: { type: Date, required: true, index: true },
    limiterId: { type: String, required: true, index: true },

    checked: { type: Number, default: 0 },
    allowed: { type: Number, default: 0 },
    blocked: { type: Number, default: 0 },

    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: 'rate_limit_metric_buckets' },
);

rateLimitMetricBucketSchema.index({ limiterId: 1, bucketStart: 1 }, { unique: true });
rateLimitMetricBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.RateLimitMetricBucket || mongoose.model('RateLimitMetricBucket', rateLimitMetricBucketSchema);
