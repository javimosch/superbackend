const mongoose = require('mongoose');

const uiComponentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z][a-z0-9_-]{1,63}$/, 'Invalid component code'],
    },
    name: { type: String, required: true, trim: true },

    html: { type: String, default: '' },
    js: { type: String, default: '' },
    css: { type: String, default: '' },

    api: { type: mongoose.Schema.Types.Mixed, default: null },
    usageMarkdown: { type: String, default: '' },

    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'ui_components' },
);

module.exports = mongoose.models.UiComponent || mongoose.model('UiComponent', uiComponentSchema);
