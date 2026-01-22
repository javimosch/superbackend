const mongoose = require('mongoose');

const uiComponentProjectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      match: [/^prj_[a-z0-9]{8,32}$/, 'Invalid projectId'],
    },
    name: { type: String, required: true, trim: true },

    isPublic: { type: Boolean, default: true, index: true },
    apiKeyHash: { type: String, default: null },

    allowedOrigins: { type: [String], default: [] },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'ui_component_projects' },
);

module.exports = mongoose.models.UiComponentProject ||
  mongoose.model('UiComponentProject', uiComponentProjectSchema);
