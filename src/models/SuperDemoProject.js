const mongoose = require('mongoose');

const superDemoProjectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      match: [/^sdp_[a-z0-9]{8,32}$/, 'Invalid projectId'],
    },
    name: { type: String, required: true, trim: true },

    isPublic: { type: Boolean, default: true, index: true },
    apiKeyHash: { type: String, default: null },

    allowedOrigins: { type: [String], default: [] },
    stylePreset: {
      type: String,
      enum: ['default', 'glass-dark', 'high-contrast', 'soft-purple'],
      default: 'default',
    },
    styleOverrides: { type: String, default: '' },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'super_demo_projects' },
);

module.exports = mongoose.models.SuperDemoProject ||
  mongoose.model('SuperDemoProject', superDemoProjectSchema);
