const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    excerpt: { type: String, default: '' },
    markdown: { type: String, default: '' },
    html: { type: String, default: '' },
    coverImageUrl: { type: String, default: '' },
    category: { type: String, default: '' },
    tags: { type: [String], default: [] },
    authorName: { type: String, default: '' },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    scheduledAt: { type: Date },
    publishedAt: { type: Date },
  },
  { timestamps: true, collection: 'blog_posts' },
);

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ status: 1, scheduledAt: 1 });

// Enforce slug uniqueness among non-archived posts. Archived posts free up slugs.
blogPostSchema.index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['draft', 'scheduled', 'published'] },
    },
  },
);

module.exports = mongoose.models.BlogPost || mongoose.model('BlogPost', blogPostSchema);
