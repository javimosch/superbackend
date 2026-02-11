const mongoose = require('mongoose');

const markdownSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
      trim: true,
      default: 'general',
    },
    group_code: {
      type: String,
      required: false,
      index: true,
      trim: true,
      default: '',
    },
    markdownRaw: {
      type: String,
      required: true,
      default: '',
    },
    publicEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    cacheTtlSeconds: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      default: null,
    },
  },
  { timestamps: true },
);

// Compound unique index for fast lookups
markdownSchema.index({ category: 1, group_code: 1, slug: 1 }, { unique: true });

// Additional indexes for common queries
markdownSchema.index({ status: 1, publicEnabled: 1 });
markdownSchema.index({ category: 1, status: 1 });
markdownSchema.index({ ownerUserId: 1, createdAt: -1 });
markdownSchema.index({ orgId: 1, createdAt: -1 });

module.exports = mongoose.model('Markdown', markdownSchema);
