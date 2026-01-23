const mongoose = require('mongoose');

const scriptRunSchema = new mongoose.Schema(
  {
    scriptId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptDefinition', required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'succeeded', 'failed', 'canceled', 'timed_out'],
      default: 'queued',
      index: true,
    },
    trigger: { type: String, enum: ['manual', 'schedule', 'api'], default: 'manual', index: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    exitCode: { type: Number, default: null },
    outputTail: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'script_runs' },
);

module.exports = mongoose.models.ScriptRun || mongoose.model('ScriptRun', scriptRunSchema);
