const mongoose = require('mongoose');

const consoleEntrySchema = new mongoose.Schema(
  {
    hash: { type: String, required: true, unique: true, index: true },
    method: { type: String, enum: ['debug', 'log', 'info', 'warn', 'error'], required: true, index: true },

    messageTemplate: { type: String, default: '', maxlength: 500 },
    topFrame: { type: String, default: '' },

    enabled: { type: Boolean, default: true, index: true },
    enabledExplicit: { type: Boolean, default: false, index: true },

    persistToCache: { type: Boolean, default: false },
    persistToDb: { type: Boolean, default: false },
    persistExplicit: { type: Boolean, default: false, index: true },

    tags: { type: [String], default: [], index: true },

    countTotal: { type: Number, default: 0 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },

    lastSample: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'console_entries' },
);

consoleEntrySchema.index({ method: 1, lastSeenAt: -1 });
consoleEntrySchema.index({ enabled: 1, lastSeenAt: -1 });

module.exports = mongoose.models.ConsoleEntry || mongoose.model('ConsoleEntry', consoleEntrySchema);
