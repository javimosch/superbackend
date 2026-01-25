jest.setTimeout(15000);

jest.mock('../models/BlogPost');

const BlogPost = require('../models/BlogPost');
const controller = require('./blogPublic.controller');

describe('blogPublic.controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { query: {}, params: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('listPublished', () => {
    test('returns items + pagination', async () => {
      const chain = {
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: '1', slug: 'a' }]),
      };

      BlogPost.find.mockReturnValue(chain);
      BlogPost.countDocuments.mockResolvedValue(1);

      await controller.listPublished(mockReq, mockRes);

      expect(BlogPost.find).toHaveBeenCalledWith({ status: 'published' });
      expect(mockRes.json).toHaveBeenCalledWith({
        items: [{ _id: '1', slug: 'a' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      });
    });

    test('applies q/tag/category filters', async () => {
      mockReq.query = { q: 'hello', tag: 'tag1', category: 'cat1', page: '2', limit: '10' };

      const chain = {
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };

      BlogPost.find.mockReturnValue(chain);
      BlogPost.countDocuments.mockResolvedValue(0);

      await controller.listPublished(mockReq, mockRes);

      const arg = BlogPost.find.mock.calls[0][0];
      expect(arg.status).toBe('published');
      expect(arg.tags).toBe('tag1');
      expect(arg.category).toBe('cat1');
      expect(arg.$or).toBeDefined();
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    test('handles errors', async () => {
      BlogPost.find.mockImplementation(() => {
        throw new Error('boom');
      });

      await controller.listPublished(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to list blog posts' });
    });
  });

  describe('getPublishedBySlug', () => {
    test('returns 400 if slug missing', async () => {
      mockReq.params.slug = '';

      await controller.getPublishedBySlug(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'slug is required' });
    });

    test('returns 404 if not found', async () => {
      mockReq.params.slug = 'missing';
      BlogPost.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await controller.getPublishedBySlug(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    test('returns post payload', async () => {
      mockReq.params.slug = 'hello';
      BlogPost.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: '1',
          title: 'T',
          slug: 'hello',
          status: 'published',
          excerpt: 'e',
          markdown: 'm',
          html: 'h',
          coverImageUrl: '/public/assets/x',
          category: 'c',
          tags: ['t1'],
          authorName: 'a',
          seoTitle: 'st',
          seoDescription: 'sd',
          scheduledAt: null,
          publishedAt: new Date('2020-01-01'),
          createdAt: new Date('2020-01-01'),
          updatedAt: new Date('2020-01-01'),
        }),
      });

      await controller.getPublishedBySlug(mockReq, mockRes);

      expect(BlogPost.findOne).toHaveBeenCalledWith({ slug: 'hello', status: 'published' });
      expect(mockRes.json).toHaveBeenCalled();
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload.post.slug).toBe('hello');
      expect(payload.post.markdown).toBe('m');
      expect(payload.post.html).toBe('h');
    });

    test('handles errors', async () => {
      mockReq.params.slug = 'hello';
      BlogPost.findOne.mockImplementation(() => {
        throw new Error('boom');
      });

      await controller.getPublishedBySlug(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to get blog post' });
    });
  });
});
