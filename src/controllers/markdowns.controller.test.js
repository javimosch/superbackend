jest.mock('../services/markdowns.service');

const markdownsService = require('../services/markdowns.service');
const markdownsController = require('./markdowns.controller');

describe('markdowns.controller', () => {
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRes = {
      json: jest.fn(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
  });

  describe('getByPath', () => {
    test('returns raw markdown by default', async () => {
      const mockDoc = { markdownRaw: '# Test Markdown Content', slug: 'endpoints' };
      markdownsService.getMarkdownByPath.mockResolvedValue(mockDoc);

      const mockReq = {
        params: {
          category: 'docs',
          group_code: 'api',
          slug: 'endpoints'
        },
        query: {},
        path: '/api/markdowns/docs/api/endpoints'
      };

      await markdownsController.getByPath(mockReq, mockRes);

      expect(markdownsService.getMarkdownByPath).toHaveBeenCalledWith(
        'docs',
        'api',
        'endpoints'
      );

      expect(mockRes.type).toHaveBeenCalledWith('text/markdown');
      expect(mockRes.send).toHaveBeenCalledWith(mockDoc.markdownRaw);
    });

    test('returns JSON when /json suffix is used', async () => {
      const mockDoc = { markdownRaw: '# Test Markdown Content', slug: 'endpoints' };
      markdownsService.getMarkdownByPath.mockResolvedValue(mockDoc);

      const mockReq = {
        params: {
          category: 'docs',
          group_code: 'api',
          slug: 'endpoints'
        },
        query: {},
        path: '/api/markdowns/docs/api/endpoints/json'
      };

      await markdownsController.getByPath(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: mockDoc });
    });

    test('returns JSON when json=1 parameter is used', async () => {
      const mockDoc = { markdownRaw: '# Test Markdown Content', slug: 'endpoints' };
      markdownsService.getMarkdownByPath.mockResolvedValue(mockDoc);

      const mockReq = {
        params: {
          category: 'docs',
          group_code: 'api',
          slug: 'endpoints'
        },
        query: { json: '1' },
        path: '/api/markdowns/docs/api/endpoints'
      };

      await markdownsController.getByPath(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: mockDoc });
    });

    test('handles missing group code', async () => {
      const mockDoc = { markdownRaw: '# Test Markdown Content', slug: 'overview' };
      markdownsService.getMarkdownByPath.mockResolvedValue(mockDoc);

      const mockReq = {
        params: {
          category: 'docs',
          slug: 'overview'
        },
        query: {},
        path: '/api/markdowns/docs/overview'
      };

      await markdownsController.getByPath(mockReq, mockRes);

      expect(markdownsService.getMarkdownByPath).toHaveBeenCalledWith(
        'docs',
        undefined,
        'overview'
      );

      expect(mockRes.send).toHaveBeenCalledWith(mockDoc.markdownRaw);
    });

    test('handles not found error', async () => {
      const error = new Error('Markdown not found');
      error.code = 'NOT_FOUND';
      markdownsService.getMarkdownByPath.mockRejectedValue(error);

      const mockReq = {
        params: {
          category: 'docs',
          group_code: 'api',
          slug: 'nonexistent'
        },
        query: {},
        path: '/api/markdowns/docs/api/nonexistent'
      };

      await markdownsController.getByPath(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Markdown not found' });
    });

    test('handles service errors', async () => {
      const error = new Error('Service error');
      markdownsService.getMarkdownByPath.mockRejectedValue(error);

      const mockReq = {
        params: {
          category: 'docs',
          group_code: 'api',
          slug: 'endpoints'
        },
        query: {},
        path: '/api/markdowns/docs/api/endpoints'
      };

      await markdownsController.getByPath(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service error' });
    });

    test('handles errors with message', async () => {
      const error = new Error('Custom error message');
      markdownsService.getMarkdownByPath.mockRejectedValue(error);

      const mockReq = {
        params: {
          category: 'docs',
          group_code: 'api',
          slug: 'endpoints'
        },
        query: {},
        path: '/api/markdowns/docs/api/endpoints'
      };

      await markdownsController.getByPath(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Custom error message' });
    });
  });

  describe('search', () => {
    test('returns search results', async () => {
      const mockResults = [
        { title: 'API Documentation', slug: 'api-docs', category: 'docs' },
        { title: 'User Guide', slug: 'user-guide', category: 'docs' }
      ];

      markdownsService.searchMarkdowns.mockResolvedValue(mockResults);

      const mockReq = {
        query: {
          q: 'api',
          category: 'docs',
          limit: '25'
        }
      };

      await markdownsController.search(mockReq, mockRes);

      expect(markdownsService.searchMarkdowns).toHaveBeenCalledWith('api', {
        category: 'docs',
        group_code: undefined,
        limit: 25
      });

      expect(mockRes.json).toHaveBeenCalledWith({ results: mockResults });
    });

    test('handles missing query parameter', async () => {
      const mockReq = {
        query: {
          category: 'docs'
        }
      };

      await markdownsController.search(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Search query (q) is required' });
    });

    test('handles empty query parameter', async () => {
      const mockReq = {
        query: {
          q: '',
          category: 'docs'
        }
      };

      await markdownsController.search(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Search query (q) is required' });
    });

    test('handles search with group code', async () => {
      const mockResults = [];
      markdownsService.searchMarkdowns.mockResolvedValue(mockResults);

      const mockReq = {
        query: {
          q: 'endpoints',
          category: 'docs',
          group_code: 'api__endpoints'
        }
      };

      await markdownsController.search(mockReq, mockRes);

      expect(markdownsService.searchMarkdowns).toHaveBeenCalledWith('endpoints', {
        category: 'docs',
        group_code: 'api__endpoints',
        limit: 50
      });
    });

    test('uses default limit when not provided', async () => {
      const mockResults = [];
      markdownsService.searchMarkdowns.mockResolvedValue(mockResults);

      const mockReq = {
        query: {
          q: 'test'
        }
      };

      await markdownsController.search(mockReq, mockRes);

      expect(markdownsService.searchMarkdowns).toHaveBeenCalledWith('test', {
        category: undefined,
        group_code: undefined,
        limit: 50
      });
    });

    test('handles service errors', async () => {
      const error = new Error('Search service error');
      markdownsService.searchMarkdowns.mockRejectedValue(error);

      const mockReq = {
        query: {
          q: 'test'
        }
      };

      await markdownsController.search(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Search service error' });
    });

    test('handles network errors', async () => {
      markdownsService.searchMarkdowns.mockRejectedValue(new Error('Network error'));

      const mockReq = {
        query: {
          q: 'test'
        }
      };

      await markdownsController.search(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Network error' });
    });
  });
});
