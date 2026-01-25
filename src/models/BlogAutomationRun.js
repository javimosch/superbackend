const mongoose = require('mongoose');

const blogAutomationRunSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['queued', 'running', 'succeeded', 'failed', 'partial', 'skipped'],
      default: 'queued',
      index: true,
    },
    trigger: {
      type: String,
      enum: ['scheduled', 'manual'],
      required: true,
      index: true,
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    configSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    topic: { type: mongoose.Schema.Types.Mixed, default: {} },
    results: { type: mongoose.Schema.Types.Mixed, default: {} },
    steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    error: { type: String, default: '' },
  },
  { timestamps: true, collection: 'blog_automation_runs' },
);

blogAutomationRunSchema.index({ createdAt: -1 });
blogAutomationRunSchema.index({ trigger: 1, createdAt: -1 });

module.exports =
  mongoose.models.BlogAutomationRun ||
  mongoose.model('BlogAutomationRun', blogAutomationRunSchema);
