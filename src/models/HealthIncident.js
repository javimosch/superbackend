const mongoose = require('mongoose');

const healthIncidentSchema = new mongoose.Schema(
  {
    healthCheckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HealthCheck',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
      index: true,
    },

    severity: {
      type: String,
      enum: ['warning', 'critical'],
      default: 'warning',
    },

    openedAt: { type: Date, default: Date.now, index: true },
    acknowledgedAt: { type: Date },
    resolvedAt: { type: Date },
    lastSeenAt: { type: Date, default: Date.now },

    consecutiveFailureCount: { type: Number, default: 0 },
    consecutiveSuccessCount: { type: Number, default: 0 },

    lastRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCheckRun' },

    summary: { type: String, default: '' },
    lastError: { type: String, default: '' },

    autoHealAttemptCount: { type: Number, default: 0 },
    lastAutoHealAttemptAt: { type: Date },
  },
  { timestamps: true, collection: 'health_incidents' },
);

healthIncidentSchema.index({ healthCheckId: 1, openedAt: -1 });
healthIncidentSchema.index({ status: 1, openedAt: -1 });

module.exports =
  mongoose.models.HealthIncident ||
  mongoose.model('HealthIncident', healthIncidentSchema);
