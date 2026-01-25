jest.setTimeout(15000);

jest.mock('../models/BlogPost');
jest.mock('./blog.service', () => ({
  generateUniqueBlogSlug: jest.fn(),
}));

const BlogPost = require('../models/BlogPost');
const { generateUniqueBlogSlug } = require('./blog.service');
const { publishScheduledDue } = require('./blogPublishing.service');

describe('blogPublishing.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('publishes due scheduled posts', async () => {
    const post = {
      _id: '1',
      title: 'T',
      slug: 't',
      status: 'scheduled',
      scheduledAt: new Date(Date.now() - 1000),
      publishedAt: null,
      save: jest.fn().mockResolvedValue(),
    };

    BlogPost.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([post]),
    });

    const result = await publishScheduledDue({ limit: 10 });

    expect(post.status).toBe('published');
    expect(post.scheduledAt).toBeNull();
    expect(post.save).toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, published: 1, errors: [] });
  });

  test('retries once on duplicate slug error by generating a unique slug', async () => {
    const duplicateError = new Error('E11000 duplicate key error collection: blog_posts index: slug_1 dup key: { slug: "t" }');

    const post = {
      _id: '1',
      title: 'Title',
      slug: 't',
      status: 'scheduled',
      scheduledAt: new Date(Date.now() - 1000),
      publishedAt: null,
      save: jest.fn()
        .mockRejectedValueOnce(duplicateError)
        .mockResolvedValueOnce(),
    };

    BlogPost.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([post]),
    });

    generateUniqueBlogSlug.mockResolvedValue('title-2');

    const result = await publishScheduledDue({ limit: 1 });

    expect(generateUniqueBlogSlug).toHaveBeenCalledWith('Title', { excludeId: '1' });
    expect(post.slug).toBe('title-2');
    expect(result.processed).toBe(1);
    expect(result.published).toBe(1);
    expect(result.errors).toEqual([]);
  });
});
