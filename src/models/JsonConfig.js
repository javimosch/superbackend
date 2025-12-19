const mongoose = require('mongoose');

const jsonConfigSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    alias: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    publicEnabled: {
      type: Boolean,
      default: false,
    },
    cacheTtlSeconds: {
      type: Number,
      default: 0,
    },
    jsonRaw: {
      type: String,
      required: true,
    },
    jsonHash: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

jsonConfigSchema.index({ slug: 1 });
jsonConfigSchema.index({ alias: 1 });

module.exports = mongoose.model('JsonConfig', jsonConfigSchema);
