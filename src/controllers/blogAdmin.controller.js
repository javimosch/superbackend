const BlogPost = require('../models/BlogPost');
const {
  extractExcerptFromMarkdown,
  generateUniqueBlogSlug,
  normalizeTags,
  slugify,
  parsePagination,
} = require('../services/blog.service');

function normalizeStringField(value) {
  if (value === undefined) return undefined;
  return String(value || '').trim();
}

exports.list = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination({
      page: req.query.page,
      limit: req.query.limit,
      maxLimit: 200,
      defaultLimit: 50,
    });

    const filter = {};

    const status = String(req.query.status || '').trim();
    if (status) filter.status = status;

    const tag = String(req.query.tag || '').trim();
    if (tag) filter.tags = tag;

    const category = String(req.query.category || '').trim();
    if (category) filter.category = category;

    const q = String(req.query.q || '').trim();
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: re }, { excerpt: re }, { slug: re }];
    }

    const statsBaseFilter = { ...filter };
    delete statsBaseFilter.status;

    const [items, total, statsTotal, statsDraft, statsScheduled, statsPublished, statsArchived] = await Promise.all([
      BlogPost.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .select('title slug status excerpt category tags authorName publishedAt scheduledAt updatedAt createdAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      BlogPost.countDocuments(filter),
      BlogPost.countDocuments(statsBaseFilter),
      BlogPost.countDocuments({ ...statsBaseFilter, status: 'draft' }),
      BlogPost.countDocuments({ ...statsBaseFilter, status: 'scheduled' }),
      BlogPost.countDocuments({ ...statsBaseFilter, status: 'published' }),
      BlogPost.countDocuments({ ...statsBaseFilter, status: 'archived' }),
    ]);

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: {
        total: statsTotal,
        draft: statsDraft,
        scheduled: statsScheduled,
        published: statsPublished,
        archived: statsArchived,
      },
    });
  } catch (error) {
    console.error('Error listing admin blog posts:', error);
    res.status(500).json({ error: 'Failed to list blog posts' });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = req.body || {};
    const title = normalizeStringField(payload.title);
    if (!title) return res.status(400).json({ error: 'title is required' });

    const markdown = String(payload.markdown || '');
    if (!markdown.trim()) return res.status(400).json({ error: 'markdown is required' });

    const html = String(payload.html || payload.markdown || '');
    const excerpt =
      normalizeStringField(payload.excerpt) || extractExcerptFromMarkdown(markdown);

    const desiredSlug = normalizeStringField(payload.slug);
    const slug = desiredSlug ? slugify(desiredSlug) : await generateUniqueBlogSlug(title);

    const post = await BlogPost.create({
      title,
      slug,
      status: 'draft',
      excerpt,
      markdown,
      html,
      coverImageUrl: normalizeStringField(payload.coverImageUrl) || '',
      category: normalizeStringField(payload.category) || '',
      tags: normalizeTags(payload.tags),
      authorName: normalizeStringField(payload.authorName) || '',
      seoTitle: normalizeStringField(payload.seoTitle) || '',
      seoDescription: normalizeStringField(payload.seoDescription) || '',
      scheduledAt: null,
      publishedAt: null,
    });

    res.status(201).json({ item: post.toObject() });
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ error: 'Failed to create blog post' });
  }
};

exports.get = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id).lean();
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json({ item: post });
  } catch (error) {
    console.error('Error getting blog post:', error);
    res.status(500).json({ error: 'Failed to get blog post' });
  }
};

exports.update = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });

    const payload = req.body || {};

    if (payload.title !== undefined) post.title = normalizeStringField(payload.title) || '';
    if (!post.title) return res.status(400).json({ error: 'title is required' });

    if (payload.slug !== undefined) {
      const desired = slugify(payload.slug);
      post.slug = desired || (await generateUniqueBlogSlug(post.title, { excludeId: post._id }));
    }
    if (!post.slug) {
      post.slug = await generateUniqueBlogSlug(post.title, { excludeId: post._id });
    }

    if (payload.markdown !== undefined) post.markdown = String(payload.markdown || '');
    if (payload.html !== undefined) post.html = String(payload.html || '');

    if (payload.excerpt !== undefined) {
      post.excerpt = normalizeStringField(payload.excerpt) || '';
    }
    if (!post.excerpt) {
      post.excerpt = extractExcerptFromMarkdown(post.markdown);
    }

    if (payload.coverImageUrl !== undefined) post.coverImageUrl = normalizeStringField(payload.coverImageUrl) || '';
    if (payload.category !== undefined) post.category = normalizeStringField(payload.category) || '';
    if (payload.authorName !== undefined) post.authorName = normalizeStringField(payload.authorName) || '';
    if (payload.seoTitle !== undefined) post.seoTitle = normalizeStringField(payload.seoTitle) || '';
    if (payload.seoDescription !== undefined) post.seoDescription = normalizeStringField(payload.seoDescription) || '';
    if (payload.tags !== undefined) post.tags = normalizeTags(payload.tags);

    await post.save();

    res.json({ item: post.toObject() });
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ error: 'Failed to update blog post' });
  }
};

exports.publish = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });

    post.status = 'published';
    post.scheduledAt = null;
    if (!post.publishedAt) post.publishedAt = new Date();
    await post.save();

    res.json({ item: post.toObject() });
  } catch (error) {
    console.error('Error publishing blog post:', error);
    res.status(500).json({ error: 'Failed to publish blog post' });
  }
};

exports.unpublish = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });

    post.status = 'draft';
    post.scheduledAt = null;
    await post.save();

    res.json({ item: post.toObject() });
  } catch (error) {
    console.error('Error unpublishing blog post:', error);
    res.status(500).json({ error: 'Failed to unpublish blog post' });
  }
};

exports.schedule = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });

    const scheduledAtRaw = req.body?.scheduledAt;
    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: 'scheduledAt is required and must be a valid date' });
    }

    post.status = 'scheduled';
    post.scheduledAt = scheduledAt;
    await post.save();

    res.json({ item: post.toObject() });
  } catch (error) {
    console.error('Error scheduling blog post:', error);
    res.status(500).json({ error: 'Failed to schedule blog post' });
  }
};

exports.archive = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });

    post.status = 'archived';
    post.scheduledAt = null;
    await post.save();

    res.json({ item: post.toObject() });
  } catch (error) {
    console.error('Error archiving blog post:', error);
    res.status(500).json({ error: 'Failed to archive blog post' });
  }
};

exports.remove = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });

    await BlogPost.deleteOne({ _id: post._id });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
};
