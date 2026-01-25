const BlogPost = require('../models/BlogPost');
const { parsePagination } = require('../services/blog.service');

exports.listPublished = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination({
      page: req.query.page,
      limit: req.query.limit,
      maxLimit: 100,
      defaultLimit: 20,
    });

    const filter = { status: 'published' };

    const tag = String(req.query.tag || '').trim();
    if (tag) {
      filter.tags = tag;
    }

    const category = String(req.query.category || '').trim();
    if (category) {
      filter.category = category;
    }

    const q = String(req.query.q || '').trim();
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: re }, { excerpt: re }];
    }

    const [items, total] = await Promise.all([
      BlogPost.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .select('title slug excerpt coverImageUrl category tags authorName publishedAt createdAt updatedAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      BlogPost.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing blog posts:', error);
    res.status(500).json({ error: 'Failed to list blog posts' });
  }
};

exports.getPublishedBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const post = await BlogPost.findOne({ slug, status: 'published' }).lean();
    if (!post) return res.status(404).json({ error: 'Not found' });

    res.json({
      post: {
        _id: post._id,
        title: post.title,
        slug: post.slug,
        status: post.status,
        excerpt: post.excerpt,
        markdown: post.markdown,
        html: post.html,
        coverImageUrl: post.coverImageUrl,
        category: post.category,
        tags: post.tags,
        authorName: post.authorName,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error getting blog post:', error);
    res.status(500).json({ error: 'Failed to get blog post' });
  }
};
