const BlogPost = require('../models/BlogPost');
const { generateUniqueBlogSlug } = require('./blog.service');

async function publishScheduledDue({ limit = 20 } = {}) {
  const l = Math.min(200, Math.max(1, Number(limit) || 20));
  const now = new Date();

  const due = await BlogPost.find({
    status: 'scheduled',
    scheduledAt: { $lte: now },
  })
    .sort({ scheduledAt: 1, createdAt: 1 })
    .limit(l);

  const results = {
    processed: 0,
    published: 0,
    errors: [],
  };

  for (const post of due) {
    results.processed += 1;
    try {
      post.status = 'published';
      post.scheduledAt = null;
      if (!post.publishedAt) post.publishedAt = new Date();

      await post.save();
      results.published += 1;
    } catch (err) {
      // If slug is no longer available (archived posts free slugs; scheduled could conflict with a newer draft),
      // regenerate a unique slug and retry once.
      const msg = String(err?.message || err || 'Unknown error');
      if (/duplicate key/i.test(msg) && /slug/i.test(msg)) {
        try {
          post.slug = await generateUniqueBlogSlug(post.title, { excludeId: post._id });
          post.status = 'published';
          post.scheduledAt = null;
          if (!post.publishedAt) post.publishedAt = new Date();
          await post.save();
          results.published += 1;
          continue;
        } catch (err2) {
          results.errors.push({ postId: String(post._id), error: String(err2?.message || err2 || '') });
          continue;
        }
      }

      results.errors.push({ postId: String(post._id), error: msg });
    }
  }

  return results;
}

module.exports = {
  publishScheduledDue,
};
