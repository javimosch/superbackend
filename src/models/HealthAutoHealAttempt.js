const mongoose = require('mongoose');

const actionResultSchema = new mongoose.Schema(
  {
    actionType: { type: String, default: '' },
    status: { type: String, enum: ['succeeded', 'failed'], required: true },
    output: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  { _id: false },
);

const healthAutoHealAttemptSchema = new mongoose.Schema(
  {
    healthCheckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HealthCheck',
      required: true,
      index: true,
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HealthIncident',
      required: true,
      index: true,
    },

    attemptNumber: { type: Number, required: true },

    status: {
      type: String,
      enum: ['running', 'succeeded', 'failed'],
      default: 'running',
      index: true,
    },

    startedAt: { type: Date, default: Date.now, index: true },
    finishedAt: { type: Date },
    durationMs: { type: Number },

    actionResults: { type: [actionResultSchema], default: [] },
  },
  { timestamps: true, collection: 'health_autoheal_attempts' },
);

healthAutoHealAttemptSchema.index({ incidentId: 1, startedAt: -1 });

healthAutoHealAttemptSchema.pre('save', function preSave(next) {
  if (this.isModified('finishedAt') && this.finishedAt && this.startedAt) {
    this.durationMs = this.finishedAt.getTime() - this.startedAt.getTime();
  }
  next();
});

module.exports =
  mongoose.models.HealthAutoHealAttempt ||
  mongoose.model('HealthAutoHealAttempt', healthAutoHealAttemptSchema);
