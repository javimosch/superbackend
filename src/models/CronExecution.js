const mongoose = require('mongoose');

const cronExecutionSchema = new mongoose.Schema(
  {
    cronJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'CronJob', required: true, index: true },
    
    // Execution details
    status: { 
      type: String, 
      enum: ['running', 'succeeded', 'failed', 'timed_out'], 
      default: 'running',
      index: true 
    },
    startedAt: { type: Date, default: Date.now, index: true },
    finishedAt: { type: Date },
    durationMs: { type: Number },
    
    // Results
    output: { type: String },
    error: { type: String },
    
    // HTTP specific
    httpStatusCode: { type: Number },
    httpResponseHeaders: { type: mongoose.Schema.Types.Mixed },
    
    // Metadata
    triggeredAt: { type: Date, required: true }, // When it was supposed to run
    actualRunAt: { type: Date, default: Date.now }, // When it actually started
  },
  { timestamps: true, collection: 'cron_executions' },
);

// Index for efficient queries
cronExecutionSchema.index({ cronJobId: 1, startedAt: -1 });
cronExecutionSchema.index({ status: 1, startedAt: -1 });

// Calculate duration before saving
cronExecutionSchema.pre('save', function preSave(next) {
  if (this.isModified('finishedAt') && this.finishedAt && this.startedAt) {
    this.durationMs = this.finishedAt.getTime() - this.startedAt.getTime();
  }
  next();
});

module.exports =
  mongoose.models.CronExecution ||
  mongoose.model('CronExecution', cronExecutionSchema);
