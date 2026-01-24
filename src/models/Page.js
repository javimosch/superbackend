const mongoose = require('mongoose');

const seoMetaSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    keywords: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
  },
  { _id: false },
);

const pageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      index: true,
    },
    collectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PageCollection',
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    templateKey: {
      type: String,
      default: 'default',
    },
    layoutKey: {
      type: String,
      default: 'default',
    },
    blocks: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    customCss: {
      type: String,
      default: '',
    },
    customJs: {
      type: String,
      default: '',
    },
    seoMeta: {
      type: seoMetaSchema,
      default: () => ({}),
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
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

pageSchema.index({ slug: 1, collectionId: 1, tenantId: 1 }, { unique: true });
pageSchema.index({ status: 1, isGlobal: 1 });
pageSchema.index({ collectionId: 1, status: 1 });

pageSchema.virtual('routePath').get(function () {
  return this._routePath || null;
});

pageSchema.set('toJSON', { virtuals: true });
pageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Page', pageSchema);
