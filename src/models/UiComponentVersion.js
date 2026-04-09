const mongoose = require('mongoose');

const uiComponentVersionSchema = new mongoose.Schema(
  {
    componentCode: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    version: {
      type: Number,
      required: true,
    },
    name: { type: String, default: '' },
    html: { type: String, default: '' },
    js: { type: String, default: '' },
    css: { type: String, default: '' },
    api: { type: mongoose.Schema.Types.Mixed, default: null },
    usageMarkdown: { type: String, default: '' },
    previewExample: { type: String, default: null },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'ui_component_versions' },
);

uiComponentVersionSchema.index({ componentCode: 1, version: -1 });

module.exports =
  mongoose.models.UiComponentVersion ||
  mongoose.model('UiComponentVersion', uiComponentVersionSchema);
