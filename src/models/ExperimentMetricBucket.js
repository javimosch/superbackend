const mongoose = require('mongoose');

const experimentMetricBucketSchema = new mongoose.Schema(
  {
    experimentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Experiment', required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },

    variantKey: { type: String, required: true, index: true },
    metricKey: { type: String, required: true, index: true },

    bucketStart: { type: Date, required: true, index: true },
    bucketMs: { type: Number, required: true },

    count: { type: Number, default: 0 },
    sum: { type: Number, default: 0 },
    sumSq: { type: Number, default: 0 },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
  },
  { timestamps: true, collection: 'experiment_metric_buckets' },
);

experimentMetricBucketSchema.index(
  { experimentId: 1, variantKey: 1, metricKey: 1, bucketStart: 1, bucketMs: 1 },
  { unique: true },
);

module.exports =
  mongoose.models.ExperimentMetricBucket ||
  mongoose.model('ExperimentMetricBucket', experimentMetricBucketSchema);
