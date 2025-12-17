const mongoose = require('mongoose');

const errorSampleSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    message: { type: String, maxlength: 2000 },
    stack: { type: String, maxlength: 5000 },
    actor: {
      userId: { type: String },
      role: String,
      ip: String,
      userAgent: String,
    },
    request: {
      method: String,
      path: String,
      statusCode: Number,
      requestId: String,
    },
    runtime: {
      url: String,
      referrer: String,
      viewport: String,
      locale: String,
      appVersion: String,
      nodeVersion: String,
      hostname: String,
    },
    extra: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const errorAggregateSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, unique: true, index: true },
    source: { type: String, enum: ['frontend', 'backend'], required: true, index: true },
    severity: { type: String, enum: ['fatal', 'error', 'warn', 'info'], default: 'error', index: true },
    errorName: { type: String, index: true },
    errorCode: String,
    messageTemplate: { type: String, maxlength: 500 },
    topFrame: String,
    httpStatusBucket: String,
    countTotal: { type: Number, default: 0 },
    countsByDay: { type: Map, of: Number, default: {} },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    samples: {
      type: [errorSampleSchema],
      default: [],
      validate: [arr => arr.length <= 20, 'samples cannot exceed 20'],
    },
    status: { type: String, enum: ['open', 'ignored', 'resolved'], default: 'open', index: true },
    resolvedAt: Date,
  },
  { timestamps: true },
);

errorAggregateSchema.index({ source: 1, lastSeenAt: -1 });
errorAggregateSchema.index({ countTotal: -1 });
errorAggregateSchema.index({ status: 1, lastSeenAt: -1 });

errorAggregateSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('ErrorAggregate', errorAggregateSchema);
