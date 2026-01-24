const mongoose = require('mongoose');

const pageCollectionSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    isGlobal: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true },
);

pageCollectionSchema.index({ slug: 1, tenantId: 1 }, { unique: true });
pageCollectionSchema.index({ isGlobal: 1, status: 1 });

module.exports = mongoose.model('PageCollection', pageCollectionSchema);
