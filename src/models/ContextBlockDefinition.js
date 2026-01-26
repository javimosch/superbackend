const mongoose = require('mongoose');

const contextBlockDefinitionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z][a-z0-9_-]{1,63}$/, 'Invalid context block code'],
    },

    label: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    type: {
      type: String,
      required: true,
      enum: ['context.db_query', 'context.service_invoke'],
      index: true,
    },

    props: { type: mongoose.Schema.Types.Mixed, default: {} },

    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'page_builder_context_block_definitions' },
);

module.exports = mongoose.models.ContextBlockDefinition || mongoose.model('ContextBlockDefinition', contextBlockDefinitionSchema);
