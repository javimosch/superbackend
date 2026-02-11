jest.mock('../services/markdowns.service');

const markdownsService = require('../services/markdowns.service');
const adminMarkdownsController = require('./adminMarkdowns.controller');

describe('adminMarkdowns.controller', () => {
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
  });

  describe('list', () => {
    test('returns list of markdowns', async () => {
      const mockData = {
        items: [
          { _id: '1', title: 'Doc 1', category: 'docs' },
          { _id: '2', title: 'Doc 2', category: 'docs' }
        ],
        total: 2,
        limit: 50,
        skip: 0
      };

      markdownsService.listMarkdowns.mockResolvedValue(mockData);

      const mockReq = {
        query: {
          category: 'docs',
          status: 'published',
          page: '1',
          limit: '50'
        }
      };

      await adminMarkdownsController.list(mockReq, mockRes);

      expect(markdownsService.listMarkdowns).toHaveBeenCalledWith(
        {
          category: 'docs',
          status: 'published',
          group_code: undefined,
          ownerUserId: undefined,
          orgId: undefined,
          search: undefined
        },
        {
          page: 1,
          limit: 50,
          sort: { updatedAt: -1 }
        },
        { isAdmin: true }
      );

      expect(mockRes.json).toHaveBeenCalledWith(mockData);
    });

    test('handles service errors', async () => {
      const error = new Error('Service error');
      error.code = 'VALIDATION';
      markdownsService.listMarkdowns.mockRejectedValue(error);

      const mockReq = { query: {} };

      // We expect console.error to be called, so let's mock it to keep output clean
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.list(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service error' });
      
      consoleSpy.mockRestore();
    });

    test('parses sort parameter', async () => {
      const mockData = { items: [], total: 0, limit: 50, skip: 0 };
      markdownsService.listMarkdowns.mockResolvedValue(mockData);

      const mockReq = {
        query: {
          sort: '{"title": 1}'
        }
      };

      await adminMarkdownsController.list(mockReq, mockRes);

      expect(markdownsService.listMarkdowns).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          sort: { title: 1 }
        }),
        { isAdmin: true }
      );
    });
  });

  describe('get', () => {
    test('returns single markdown', async () => {
      const mockItem = {
        _id: '1',
        title: 'Test Doc',
        category: 'docs',
        slug: 'test'
      };

      markdownsService.getMarkdownById.mockResolvedValue(mockItem);

      const mockReq = { params: { id: '1' } };

      await adminMarkdownsController.get(mockReq, mockRes);

      expect(markdownsService.getMarkdownById).toHaveBeenCalledWith('1');
      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });

    test('handles not found', async () => {
      markdownsService.getMarkdownById.mockResolvedValue(null);

      const mockReq = { params: { id: 'nonexistent' } };

      await adminMarkdownsController.get(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Markdown not found' });
    });

    test('handles service errors', async () => {
      const error = new Error('Service error');
      error.code = 'NOT_FOUND';
      markdownsService.getMarkdownById.mockRejectedValue(error);

      const mockReq = { params: { id: '1' } };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.get(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service error' });
      
      consoleSpy.mockRestore();
    });
  });

  describe('create', () => {
    test('creates markdown successfully', async () => {
      const mockItem = {
        _id: '1',
        title: 'New Doc',
        category: 'docs',
        slug: 'new-doc'
      };

      markdownsService.createMarkdown.mockResolvedValue(mockItem);

      const mockReq = {
        body: {
          title: 'New Doc',
          category: 'docs',
          markdownRaw: '# New Document'
        }
      };

      await adminMarkdownsController.create(mockReq, mockRes);

      expect(markdownsService.createMarkdown).toHaveBeenCalledWith(mockReq.body);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });

    test('handles validation errors', async () => {
      const error = new Error('Title is required');
      error.code = 'VALIDATION';
      markdownsService.createMarkdown.mockRejectedValue(error);

      const mockReq = { body: {} };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Title is required' });
      
      consoleSpy.mockRestore();
    });

    test('handles path uniqueness errors', async () => {
      const error = new Error('Path must be unique');
      error.code = 'PATH_NOT_UNIQUE';
      markdownsService.createMarkdown.mockRejectedValue(error);

      const mockReq = { body: { title: 'Test' } };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Path must be unique' });
      
      consoleSpy.mockRestore();
    });
  });

  describe('update', () => {
    test('updates markdown successfully', async () => {
      const mockItem = {
        _id: '1',
        title: 'Updated Doc',
        category: 'docs',
        slug: 'updated-doc'
      };

      markdownsService.updateMarkdown.mockResolvedValue(mockItem);

      const mockReq = {
        params: { id: '1' },
        body: {
          title: 'Updated Doc',
          status: 'published'
        }
      };

      await adminMarkdownsController.update(mockReq, mockRes);

      expect(markdownsService.updateMarkdown).toHaveBeenCalledWith('1', mockReq.body);
      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });

    test('handles not found errors', async () => {
      const error = new Error('Markdown not found');
      error.code = 'NOT_FOUND';
      markdownsService.updateMarkdown.mockRejectedValue(error);

      const mockReq = {
        params: { id: 'nonexistent' },
        body: { title: 'Updated' }
      };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.update(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Markdown not found' });
      
      consoleSpy.mockRestore();
    });

    test('handles validation errors', async () => {
      const error = new Error('Invalid status');
      error.code = 'VALIDATION';
      markdownsService.updateMarkdown.mockRejectedValue(error);

      const mockReq = {
        params: { id: '1' },
        body: { status: 'invalid' }
      };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.update(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid status' });
      
      consoleSpy.mockRestore();
    });
  });

  describe('remove', () => {
    test('deletes markdown successfully', async () => {
      markdownsService.deleteMarkdown.mockResolvedValue({ success: true });

      const mockReq = { params: { id: '1' } };

      await adminMarkdownsController.remove(mockReq, mockRes);

      expect(markdownsService.deleteMarkdown).toHaveBeenCalledWith('1');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    test('handles not found errors', async () => {
      const error = new Error('Markdown not found');
      error.code = 'NOT_FOUND';
      markdownsService.deleteMarkdown.mockRejectedValue(error);

      const mockReq = { params: { id: 'nonexistent' } };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.remove(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Markdown not found' });
      
      consoleSpy.mockRestore();
    });
  });

  describe('getFolderContents', () => {
    test('returns folder contents', async () => {
      const mockContents = {
        items: [
          { _id: '1', title: 'File 1', slug: 'file1' },
          { _id: '2', title: 'File 2', slug: 'file2' }
        ],
        total: 2,
        limit: 100,
        skip: 0
      };

      markdownsService.getFolderContents.mockResolvedValue(mockContents);

      const mockReq = {
        params: { category: 'docs', group_code: 'api__endpoints' },
        query: { page: '1', limit: '100' }
      };

      await adminMarkdownsController.getFolderContents(mockReq, mockRes);

      expect(markdownsService.getFolderContents).toHaveBeenCalledWith(
        'docs',
        'api__endpoints',
        {
          page: 1,
          limit: 100,
          sort: { title: 1 }
        },
        { isAdmin: true }
      );

      expect(mockRes.json).toHaveBeenCalledWith(mockContents);
    });

    test('handles root folder (no group_code)', async () => {
      const mockContents = { items: [], total: 0, limit: 100, skip: 0 };
      markdownsService.getFolderContents.mockResolvedValue(mockContents);

      const mockReq = {
        params: { category: 'docs' },
        query: {}
      };

      await adminMarkdownsController.getFolderContents(mockReq, mockRes);

      expect(markdownsService.getFolderContents).toHaveBeenCalledWith(
        'docs',
        undefined,
        expect.objectContaining({
          page: 1,
          limit: 100,
          sort: { title: 1 }
        }),
        { isAdmin: true }
      );
    });

    test('handles service errors', async () => {
      const error = new Error('Service error');
      markdownsService.getFolderContents.mockRejectedValue(error);

      const mockReq = {
        params: { category: 'docs' },
        query: {}
      };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.getFolderContents(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service error' });
      
      consoleSpy.mockRestore();
    });
  });

  describe('validatePath', () => {
    test('validates unique path', async () => {
      markdownsService.validatePathUniqueness.mockResolvedValue(true);

      const mockReq = {
        body: {
          category: 'docs',
          group_code: 'api',
          slug: 'endpoints'
        }
      };

      await adminMarkdownsController.validatePath(mockReq, mockRes);

      expect(markdownsService.validatePathUniqueness).toHaveBeenCalledWith(
        'docs',
        'api',
        'endpoints',
        undefined
      );

      expect(mockRes.json).toHaveBeenCalledWith({ unique: true });
    });

    test('validates with exclude ID', async () => {
      markdownsService.validatePathUniqueness.mockResolvedValue(false);

      const mockReq = {
        body: {
          category: 'docs',
          group_code: 'api',
          slug: 'endpoints',
          excludeId: 'current-id'
        }
      };

      await adminMarkdownsController.validatePath(mockReq, mockRes);

      expect(markdownsService.validatePathUniqueness).toHaveBeenCalledWith(
        'docs',
        'api',
        'endpoints',
        'current-id'
      );

      expect(mockRes.json).toHaveBeenCalledWith({ unique: false });
    });

    test('handles missing required parameters', async () => {
      const mockReq = {
        body: {
          group_code: 'api',
          slug: 'endpoints'
        }
      };

      await adminMarkdownsController.validatePath(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'category and slug are required' });
    });

    test('handles service errors', async () => {
      const error = new Error('Service error');
      markdownsService.validatePathUniqueness.mockRejectedValue(error);

      const mockReq = {
        body: {
          category: 'docs',
          slug: 'endpoints'
        }
      };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.validatePath(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service error' });
      
      consoleSpy.mockRestore();
    });
  });

  describe('getGroupCodes', () => {
    test('returns unique group codes', async () => {
      const mockGroupCodes = ['foo', 'bar'];
      markdownsService.getUniqueGroupCodes.mockResolvedValue(mockGroupCodes);

      const mockReq = {
        params: { category: 'docs' }
      };

      await adminMarkdownsController.getGroupCodes(mockReq, mockRes);

      expect(markdownsService.getUniqueGroupCodes).toHaveBeenCalledWith('docs', { isAdmin: true });
      expect(mockRes.json).toHaveBeenCalledWith(mockGroupCodes);
    });

    test('handles missing category parameter', async () => {
      const mockReq = { params: {} };

      await adminMarkdownsController.getGroupCodes(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'category is required' });
    });

    test('handles service errors', async () => {
      const error = new Error('Service error');
      markdownsService.getUniqueGroupCodes.mockRejectedValue(error);

      const mockReq = { params: { category: 'docs' } };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminMarkdownsController.getGroupCodes(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service error' });
      
      consoleSpy.mockRestore();
    });
  });
});
