const mongoose = require('mongoose');

const uiComponentProjectComponentSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    componentCode: { type: String, required: true, index: true },
    enabled: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'ui_component_project_components' },
);

uiComponentProjectComponentSchema.index(
  { projectId: 1, componentCode: 1 },
  { unique: true },
);

module.exports = mongoose.models.UiComponentProjectComponent ||
  mongoose.model('UiComponentProjectComponent', uiComponentProjectComponentSchema);
