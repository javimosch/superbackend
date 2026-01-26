const mongoose = require('mongoose');

const consoleLogSchema = new mongoose.Schema(
  {
    entryHash: { type: String, required: true, index: true },
    method: { type: String, enum: ['debug', 'log', 'info', 'warn', 'error'], required: true, index: true },

    message: { type: String, default: '', maxlength: 2000 },
    argsPreview: { type: String, default: '', maxlength: 5000 },

    tagsSnapshot: { type: [String], default: [], index: true },
    requestId: { type: String, default: '', index: true },

    createdAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: false, collection: 'console_logs' },
);

consoleLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
consoleLogSchema.index({ entryHash: 1, createdAt: -1 });

module.exports = mongoose.models.ConsoleLog || mongoose.model('ConsoleLog', consoleLogSchema);
