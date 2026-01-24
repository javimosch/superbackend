const mongoose = require('mongoose');

const blockDefinitionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z][a-z0-9_-]{1,63}$/, 'Invalid block code'],
    },

    label: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Fields schema (server-side validation happens in services)
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },

    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'page_builder_block_definitions' },
);

module.exports = mongoose.models.BlockDefinition || mongoose.model('BlockDefinition', blockDefinitionSchema);
