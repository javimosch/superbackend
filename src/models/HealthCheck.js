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

const httpAuthRefSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['bearer', 'basic', 'none'], default: 'none' },

    // For basic auth we store the username in the HealthCheck doc,
    // but keep sensitive values in encrypted GlobalSettings.
    username: { type: String },

    // References to GlobalSetting keys (type='encrypted')
    tokenSettingKey: { type: String },
    passwordSettingKey: { type: String },
  },
  { _id: false },
);

const autoHealActionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['http', 'script', 'notify_only'], required: true },
    name: { type: String, default: '' },

    // http action
    httpMethod: { type: String, enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'POST' },
    httpUrl: { type: String },
    httpHeaders: { type: [httpHeaderSchema], default: [] },
    httpBody: { type: String, default: '' },
    httpBodyType: { type: String, enum: ['json', 'raw', 'form'], default: 'raw' },
    httpAuth: { type: httpAuthRefSchema, default: () => ({}) },
    timeoutMs: { type: Number },

    // script action
    scriptId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptDefinition' },
    scriptEnv: { type: [envVarSchema], default: [] },
  },
  { _id: false },
);

const healthCheckSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },

    enabled: { type: Boolean, default: true, index: true },

    cronExpression: { type: String, required: true },
    timezone: { type: String, default: 'UTC' },
    nextRunAt: { type: Date, index: true },

    checkType: { type: String, enum: ['http', 'script', 'internal'], required: true },

    // Common
    timeoutMs: { type: Number, default: 30000 },

    // HTTP check
    httpMethod: { type: String, enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
    httpUrl: { type: String, required: function requiredHttpUrl() { return this.checkType === 'http'; } },
    httpHeaders: { type: [httpHeaderSchema], default: [] },
    httpBody: { type: String, default: '' },
    httpBodyType: { type: String, enum: ['json', 'raw', 'form'], default: 'raw' },
    httpAuth: { type: httpAuthRefSchema, default: () => ({}) },

    // Script check
    scriptId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptDefinition' },
    scriptEnv: { type: [envVarSchema], default: [] },

    // Evaluation
    expectedStatusCodes: { type: [Number], default: [200] },
    maxLatencyMs: { type: Number },
    bodyMustMatch: { type: String },
    bodyMustNotMatch: { type: String },

    consecutiveFailuresToOpen: { type: Number, default: 3 },
    consecutiveSuccessesToResolve: { type: Number, default: 2 },

    retries: { type: Number, default: 0 },
    retryDelayMs: { type: Number, default: 0 },

    // Alerting
    notifyOnOpen: { type: Boolean, default: true },
    notifyOnResolve: { type: Boolean, default: true },
    notifyOnEscalation: { type: Boolean, default: false },
    notificationChannel: { type: String, enum: ['in_app', 'email', 'both'], default: 'in_app' },
    notifyUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    suppressNotificationsWhenAcknowledged: { type: Boolean, default: true },

    // Auto-heal
    autoHealEnabled: { type: Boolean, default: false },
    autoHealWaitMs: { type: Number, default: 0 },
    autoHealCooldownMs: { type: Number, default: 5 * 60 * 1000 },
    autoHealMaxAttemptsPerIncident: { type: Number, default: 3 },
    autoHealBackoffPolicy: { type: String, enum: ['fixed', 'exponential'], default: 'fixed' },
    autoHealBackoffMs: { type: Number, default: 60 * 1000 },
    autoHealActions: { type: [autoHealActionSchema], default: [] },

    // Operational
    lastRunAt: { type: Date },
    lastStatus: { type: String, enum: ['healthy', 'unhealthy', 'unknown'], default: 'unknown' },
    lastLatencyMs: { type: Number },
    currentIncidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthIncident' },

    // Streaks (persisted to avoid expensive queries when deciding to open/resolve incidents)
    consecutiveFailureCount: { type: Number, default: 0 },
    consecutiveSuccessCount: { type: Number, default: 0 },

    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: 'health_checks' },
);

healthCheckSchema.index({ enabled: 1, nextRunAt: 1 });
healthCheckSchema.index({ checkType: 1, enabled: 1 });

module.exports =
  mongoose.models.HealthCheck ||
  mongoose.model('HealthCheck', healthCheckSchema);
