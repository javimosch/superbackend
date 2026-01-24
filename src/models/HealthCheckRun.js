const mongoose = require('mongoose');

const healthCheckRunSchema = new mongoose.Schema(
  {
    healthCheckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HealthCheck',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['running', 'healthy', 'unhealthy', 'timed_out', 'error'],
      default: 'running',
      index: true,
    },

    attempt: { type: Number, default: 0 },

    startedAt: { type: Date, default: Date.now, index: true },
    finishedAt: { type: Date },
    durationMs: { type: Number },

    latencyMs: { type: Number },

    httpStatusCode: { type: Number },
    httpResponseHeaders: { type: mongoose.Schema.Types.Mixed },
    responseBodySnippet: { type: String },

    reason: { type: String },
    errorMessage: { type: String },

    incidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthIncident' },
  },
  { timestamps: true, collection: 'health_check_runs' },
);

healthCheckRunSchema.index({ healthCheckId: 1, startedAt: -1 });
healthCheckRunSchema.index({ status: 1, startedAt: -1 });

healthCheckRunSchema.pre('save', function preSave(next) {
  if (this.isModified('finishedAt') && this.finishedAt && this.startedAt) {
    this.durationMs = this.finishedAt.getTime() - this.startedAt.getTime();
  }
  next();
});

module.exports =
  mongoose.models.HealthCheckRun ||
  mongoose.model('HealthCheckRun', healthCheckRunSchema);
