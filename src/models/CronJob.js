const mongoose = require('mongoose');

const envVarSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false },
);

const httpHeaderSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false },
);

const httpAuthSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['bearer', 'basic', 'none'], default: 'none' },
    token: { type: String },
    username: { type: String },
    password: { type: String },
  },
  { _id: false },
);

const cronJobSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    
    // Schedule configuration
    cronExpression: { type: String, required: true },
    timezone: { type: String, default: 'UTC' },
    enabled: { type: Boolean, default: true, index: true },
    nextRunAt: { type: Date, index: true },
    
    // Task configuration
    taskType: { type: String, enum: ['script', 'http'], required: true },
    
    // Script task fields
    scriptId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptDefinition' },
    scriptEnv: { type: [envVarSchema], default: [] },
    
    // HTTP task fields
    httpMethod: { type: String, enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
    httpUrl: { type: String, required: function() { return this.taskType === 'http'; } },
    httpHeaders: { type: [httpHeaderSchema], default: [] },
    httpBody: { type: String },
    httpBodyType: { type: String, enum: ['json', 'raw', 'form'], default: 'raw' },
    httpAuth: { type: httpAuthSchema, default: () => ({}) },
    
    // Common fields
    timeoutMs: { type: Number, default: 300000 }, // 5 minutes
    
    // Metadata
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: 'cron_jobs' },
);

// Index for efficient queries
cronJobSchema.index({ taskType: 1, enabled: 1 });
cronJobSchema.index({ nextRunAt: 1, enabled: 1 });

module.exports =
  mongoose.models.CronJob ||
  mongoose.model('CronJob', cronJobSchema);
