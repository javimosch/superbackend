jest.setTimeout(15000);

jest.mock('../models/BlogPost');

const BlogPost = require('../models/BlogPost');
const controller = require('./blogAdmin.controller');

describe('blogAdmin.controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { query: {}, params: {}, body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('list', () => {
    test('returns items + pagination + stats', async () => {
      const chain = {
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: '1', slug: 's', status: 'draft' }]),
      };

      BlogPost.find.mockReturnValue(chain);

      BlogPost.countDocuments.mockImplementation(async (filter) => {
        if (!filter || Object.keys(filter).length === 0) return 10;
        if (filter.status === 'draft') return 2;
        if (filter.status === 'scheduled') return 3;
        if (filter.status === 'published') return 4;
        if (filter.status === 'archived') return 1;
        // total for list filter
        return 1;
      });

      await controller.list(mockReq, mockRes);

      const payload = mockRes.json.mock.calls[0][0];
      expect(payload.items).toHaveLength(1);
      expect(payload.pagination).toEqual({ page: 1, limit: 50, total: 10, pages: 1 });
      expect(payload.stats).toEqual({ total: 10, draft: 2, scheduled: 3, published: 4, archived: 1 });
    });

    test('applies filters', async () => {
      mockReq.query = { status: 'published', q: 'hello', tag: 't1', category: 'c1', limit: '10', page: '2' };
      const chain = {
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };
      BlogPost.find.mockReturnValue(chain);
      BlogPost.countDocuments.mockResolvedValue(0);

      await controller.list(mockReq, mockRes);

      const filter = BlogPost.find.mock.calls[0][0];
      expect(filter.status).toBe('published');
      expect(filter.tags).toBe('t1');
      expect(filter.category).toBe('c1');
      expect(filter.$or).toBeDefined();
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('create', () => {
    test('returns 400 for missing title', async () => {
      mockReq.body = { markdown: '# hi' };
      await controller.create(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'title is required' });
    });

    test('returns 400 for missing markdown', async () => {
      mockReq.body = { title: 'Hi', markdown: '   ' };
      await controller.create(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'markdown is required' });
    });
  });

  describe('suggestions', () => {
    test('returns unique categories, tags, and authors', async () => {
      BlogPost.distinct
        .mockResolvedValueOnce(['Tech', 'AI']) // categories
        .mockResolvedValueOnce(['Author 1']); // authorNames
      
      BlogPost.aggregate.mockResolvedValue([{ tag: 'news' }, { tag: 'node' }]);

      await controller.suggestions(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        categories: ['AI', 'Tech'],
        tags: ['news', 'node'],
        authorNames: ['Author 1']
      });
    });
  });

  describe('publish', () => {
    test('marks post as published and sets publishedAt', async () => {
      const save = jest.fn().mockResolvedValue();
      const mockPost = {
        _id: '1',
        status: 'draft',
        save,
        toObject: function() { return { ...this, status: 'published' }; }
      };
      BlogPost.findById.mockResolvedValue(mockPost);
      mockReq.params.id = '1';

      await controller.publish(mockReq, mockRes);

      expect(mockPost.status).toBe('published');
      expect(save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ item: expect.objectContaining({ status: 'published' }) });
    });
  });

  describe('schedule', () => {
    test('schedules post for future date', async () => {
      const save = jest.fn().mockResolvedValue();
      const mockPost = {
        _id: '1',
        status: 'draft',
        save,
        toObject: function() { return { ...this, status: 'scheduled' }; }
      };
      BlogPost.findById.mockResolvedValue(mockPost);
      
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      mockReq.params.id = '1';
      mockReq.body = { scheduledAt: futureDate };

      await controller.schedule(mockReq, mockRes);

      expect(mockPost.status).toBe('scheduled');
      expect(mockPost.scheduledAt).toBeInstanceOf(Date);
      expect(save).toHaveBeenCalled();
    });

    test('returns 400 for invalid date', async () => {
      BlogPost.findById.mockResolvedValue({ _id: '1' });
      mockReq.params.id = '1';
      mockReq.body = { scheduledAt: 'invalid' };

      await controller.schedule(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('remove', () => {
    test('deletes post from database', async () => {
      BlogPost.findById.mockResolvedValue({ _id: '1' });
      BlogPost.deleteOne.mockResolvedValue({ deletedCount: 1 });
      mockReq.params.id = '1';

      await controller.remove(mockReq, mockRes);

      expect(BlogPost.deleteOne).toHaveBeenCalledWith({ _id: '1' });
      expect(mockRes.json).toHaveBeenCalledWith({ deleted: true });
    });
  });

  describe('update', () => {
    test('updates post fields successfully', async () => {
      const mockPost = {
        _id: '1',
        title: 'Old Title',
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };
      BlogPost.findById.mockResolvedValue(mockPost);
      mockReq.params.id = '1';
      mockReq.body = { title: 'New Title', slug: 'new-slug' };

      await controller.update(mockReq, mockRes);

      expect(mockPost.title).toBe('New Title');
      expect(mockPost.slug).toBe('new-slug');
      expect(mockPost.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('returns 404 if post not found', async () => {
      BlogPost.findById.mockResolvedValue(null);
      mockReq.params.id = 'missing';
      await controller.update(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('archive', () => {
    test('sets status archived and clears scheduledAt', async () => {
      const save = jest.fn().mockResolvedValue();
      BlogPost.findById.mockResolvedValue({
        _id: '1',
        status: 'draft',
        scheduledAt: new Date(),
        save,
        toObject: () => ({ _id: '1', status: 'archived', scheduledAt: null }),
      });

      mockReq.params.id = '1';

      await controller.archive(mockReq, mockRes);

      expect(save).toHaveBeenCalled();
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload.item.status).toBe('archived');
    });
  });
});
