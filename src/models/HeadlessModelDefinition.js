const mongoose = require('mongoose');

const headlessFieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    required: { type: Boolean, default: false },
    unique: { type: Boolean, default: false },
    default: { type: mongoose.Schema.Types.Mixed, default: undefined },
    validation: { type: mongoose.Schema.Types.Mixed, default: null },
    refModelCode: { type: String, default: null },
  },
  { _id: false },
);

const headlessIndexSchema = new mongoose.Schema(
  {
    fields: { type: mongoose.Schema.Types.Mixed, required: true },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const headlessModelDefinitionSchema = new mongoose.Schema(
  {
    codeIdentifier: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    description: { type: String, default: '' },
    fields: { type: [headlessFieldSchema], default: [] },
    indexes: { type: [headlessIndexSchema], default: [] },
    sourceType: { type: String, enum: ['internal', 'external'], default: 'internal', index: true },
    sourceCollectionName: { type: String, default: null, index: true },
    isExternal: { type: Boolean, default: false, index: true },
    inference: {
      enabled: { type: Boolean, default: false },
      lastInferredAt: { type: Date, default: null },
      sampleSize: { type: Number, default: null },
      warnings: { type: [String], default: [] },
      stats: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    isActive: { type: Boolean, default: true, index: true },
    version: { type: Number, default: 1 },
    fieldsHash: { type: String, default: null },
    previousFields: { type: [headlessFieldSchema], default: [] },
    previousIndexes: { type: [headlessIndexSchema], default: [] },
  },
  { timestamps: true, collection: 'headless_model_definitions' },
);

module.exports = mongoose.models.HeadlessModelDefinition ||
  mongoose.model('HeadlessModelDefinition', headlessModelDefinitionSchema);
