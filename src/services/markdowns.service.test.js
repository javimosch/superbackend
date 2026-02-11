jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('abcd', 'hex')),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('hash')
  }))
}));

let mockMarkdownModel;

jest.mock('../models/Markdown', () => {
  mockMarkdownModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn(),
  };
  return mockMarkdownModel;
});

const Markdown = require('../models/Markdown');
const markdownsService = require('./markdowns.service');

const mockFindOneWithLean = (value) => {
  mockMarkdownModel.findOne.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value)
  });
};

const mockFindOneLeanOnly = (value) => {
  mockMarkdownModel.findOne.mockReturnValue({
    lean: jest.fn().mockResolvedValue(value)
  });
};

const mockFindOneWithSelectAndLean = (value) => {
  mockMarkdownModel.findOne.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value)
  });
};

const mockFindWithLean = (value) => {
  mockMarkdownModel.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value)
  });
};

const mockFindByIdWithLean = (value) => {
  mockMarkdownModel.findById.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value)
  });
};

const mockFindByIdAndDeleteWithLean = (value) => {
  mockMarkdownModel.findByIdAndDelete.mockReturnValue({
    lean: jest.fn().mockResolvedValue(value)
  });
};

const mockCreateWithToObject = (value) => {
  const mockDoc = { ...value, toObject: jest.fn().mockReturnValue(value) };
  mockMarkdownModel.create.mockResolvedValue(mockDoc);
  return mockDoc;
};

describe('markdowns.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeGroupCode', () => {
    test('normalizes group codes correctly', () => {
      expect(markdownsService.normalizeGroupCode('folder__subfolder')).toBe('folder__subfolder');
      expect(markdownsService.normalizeGroupCode('Folder__SubFolder')).toBe('folder__subfolder');
      expect(markdownsService.normalizeGroupCode('  folder__subfolder  ')).toBe('folder__subfolder');
      expect(markdownsService.normalizeGroupCode('folder___subfolder')).toBe('folder__subfolder');
      expect(markdownsService.normalizeGroupCode('_folder__subfolder_')).toBe('folder__subfolder');
      expect(markdownsService.normalizeGroupCode('')).toBe('');
      expect(markdownsService.normalizeGroupCode(null)).toBe('');
      expect(markdownsService.normalizeGroupCode(undefined)).toBe('');
    });

    test('removes invalid characters', () => {
      expect(markdownsService.normalizeGroupCode('folder@#$subfolder')).toBe('foldersubfolder');
      expect(markdownsService.normalizeGroupCode('folder subfolder')).toBe('foldersubfolder');
    });
  });

  describe('parseGroupCode', () => {
    test('parses group codes into parts', () => {
      expect(markdownsService.parseGroupCode('folder__subfolder')).toEqual(['folder', 'subfolder']);
      expect(markdownsService.parseGroupCode('folder__subfolder__file')).toEqual(['folder', 'subfolder', 'file']);
      expect(markdownsService.parseGroupCode('')).toEqual([]);
      expect(markdownsService.parseGroupCode(null)).toEqual([]);
      expect(markdownsService.parseGroupCode(undefined)).toEqual([]);
    });

    test('filters empty parts', () => {
      expect(markdownsService.parseGroupCode('folder____subfolder')).toEqual(['folder', 'subfolder']);
      expect(markdownsService.parseGroupCode('__folder__subfolder__')).toEqual(['folder', 'subfolder']);
    });
  });

  describe('buildGroupCode', () => {
    test('builds group code from parts', () => {
      expect(markdownsService.buildGroupCode(['folder', 'subfolder'])).toBe('folder__subfolder');
      expect(markdownsService.buildGroupCode(['folder', 'subfolder', 'file'])).toBe('folder__subfolder__file');
      expect(markdownsService.buildGroupCode([])).toBe('');
      expect(markdownsService.buildGroupCode(['folder'])).toBe('folder');
    });

    test('filters empty parts', () => {
      expect(markdownsService.buildGroupCode(['folder', '', 'subfolder'])).toBe('folder__subfolder');
      expect(markdownsService.buildGroupCode(['', 'folder', ''])).toBe('folder');
    });
  });

  describe('normalizeCategory', () => {
    test('normalizes categories correctly', () => {
      expect(markdownsService.normalizeCategory('Docs')).toBe('docs');
      expect(markdownsService.normalizeCategory('  docs  ')).toBe('docs');
      expect(markdownsService.normalizeCategory('Docs_API')).toBe('docs_api');
      expect(markdownsService.normalizeCategory('')).toBe('general');
      expect(markdownsService.normalizeCategory(null)).toBe('general');
      expect(markdownsService.normalizeCategory(undefined)).toBe('general');
    });

    test('handles special characters', () => {
      expect(markdownsService.normalizeCategory('Docs@API')).toBe('docsapi');
      expect(markdownsService.normalizeCategory('Docs API')).toBe('docsapi');
    });
  });

  describe('validatePathUniqueness', () => {
    test('validates unique path successfully', async () => {
      mockFindOneWithSelectAndLean(null);
      
      const result = await markdownsService.validatePathUniqueness('docs', 'api', 'endpoints');
      expect(result).toBe(true);
      expect(Markdown.findOne).toHaveBeenCalledWith({
        category: 'docs',
        group_code: 'api',
        slug: 'endpoints'
      });
    });

    test('detects duplicate path', async () => {
      mockFindOneWithSelectAndLean({ _id: 'existing-id' });
      
      const result = await markdownsService.validatePathUniqueness('docs', 'api', 'endpoints');
      expect(result).toBe(false);
    });

    test('excludes specific ID from check', async () => {
      // When we exclude the existing ID, no document should be found
      mockFindOneWithSelectAndLean(null);
      
      const result = await markdownsService.validatePathUniqueness('docs', 'api', 'endpoints', 'existing-id');
      expect(result).toBe(true);
      expect(Markdown.findOne).toHaveBeenCalledWith({
        category: 'docs',
        group_code: 'api',
        slug: 'endpoints',
        _id: { $ne: 'existing-id' }
      });
    });
  });

  describe('createMarkdown', () => {
    test('creates markdown with valid data', async () => {
      const mockDoc = {
        _id: 'test-id',
        title: 'Test Markdown',
        slug: 'test-abcd',
        category: 'docs',
        group_code: 'api',
        markdownRaw: '# Test',
        publicEnabled: false,
        cacheTtlSeconds: 0
      };

      mockCreateWithToObject(mockDoc);
      mockFindOneWithSelectAndLean(null); // For uniqueness check

      const result = await markdownsService.createMarkdown({
        title: 'Test Markdown',
        category: 'docs',
        group_code: 'api',
        markdownRaw: '# Test'
      });

      expect(result).toEqual(mockDoc);
      expect(Markdown.create).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Test Markdown',
        category: 'docs',
        group_code: 'api',
        markdownRaw: '# Test',
        publicEnabled: false,
        cacheTtlSeconds: 0
      }));
    });

    test('throws error for missing title', async () => {
      await expect(markdownsService.createMarkdown({
        category: 'docs',
        markdownRaw: '# Test'
      })).rejects.toThrow('title is required');
    });

    test('throws error for duplicate path', async () => {
      // Mock findOne to always return a document (all slugs taken)
      mockFindOneWithSelectAndLean({ _id: 'existing-id' });

      await expect(markdownsService.createMarkdown({
        title: 'Test Markdown',
        category: 'docs',
        group_code: 'api',
        markdownRaw: '# Test'
      })).rejects.toThrow('Failed to generate unique slug');
    });

    test('normalizes input data', async () => {
      const mockDoc = {
        _id: 'test-id',
        title: 'Test Markdown',
        slug: 'test-abcd',
        category: 'docs',
        group_code: 'api',
        markdownRaw: '# Test',
        publicEnabled: true,
        cacheTtlSeconds: 300
      };

      mockCreateWithToObject(mockDoc);
      mockFindOneWithSelectAndLean(null);

      await markdownsService.createMarkdown({
        title: '  Test Markdown  ',
        category: '  DOCS  ',
        group_code: 'API__ENDPOINTS',
        markdownRaw: '# Test',
        publicEnabled: 'true',
        cacheTtlSeconds: '300'
      });

      expect(Markdown.create).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Test Markdown',
        category: 'docs',
        group_code: 'api__endpoints',
        publicEnabled: true,
        cacheTtlSeconds: 300
      }));
    });
  });

  describe('getMarkdownByPath', () => {
    test('gets markdown by path successfully', async () => {
      const mockDoc = {
        category: 'docs',
        group_code: 'api',
        slug: 'endpoints',
        markdownRaw: '# API Endpoints',
        cacheTtlSeconds: 300
      };

      mockFindOneLeanOnly(mockDoc);

      const result = await markdownsService.getMarkdownByPath('docs', 'api', 'endpoints');
      expect(result).toBe('# API Endpoints');
      expect(Markdown.findOne).toHaveBeenCalledWith({
        category: 'docs',
        group_code: 'api',
        slug: 'endpoints',
        publicEnabled: true,
        status: 'published'
      });
    });

    test('throws error for not found', async () => {
      mockFindOneLeanOnly(null);

      await expect(markdownsService.getMarkdownByPath('docs', 'api', 'nonexistent'))
        .rejects.toThrow('Markdown not found');
    });

    test('handles empty group code', async () => {
      const mockDoc = {
        category: 'docs',
        group_code: '',
        slug: 'overview',
        markdownRaw: '# Overview',
        cacheTtlSeconds: 0
      };

      mockFindOneLeanOnly(mockDoc);

      const result = await markdownsService.getMarkdownByPath('docs', '', 'overview');
      expect(result).toBe('# Overview');
      expect(Markdown.findOne).toHaveBeenCalledWith({
        category: 'docs',
        group_code: '',
        slug: 'overview',
        publicEnabled: true,
        status: 'published'
      });
    });
  });

  describe('updateMarkdown', () => {
    test('updates markdown successfully', async () => {
      const mockDoc = {
        _id: 'test-id',
        title: 'Original Title',
        category: 'docs',
        group_code: 'api',
        slug: 'endpoints',
        markdownRaw: '# Original',
        publicEnabled: false,
        status: 'draft',
        cacheTtlSeconds: 0,
        save: jest.fn().mockResolvedValue(true),
        toObject: jest.fn().mockReturnValue({
          _id: 'test-id',
          title: 'Updated Title',
          category: 'docs',
          group_code: 'api',
          slug: 'endpoints',
          publicEnabled: true,
          status: 'published'
        })
      };

      Markdown.findById.mockResolvedValue(mockDoc);
      mockFindOneLeanOnly(null); // For uniqueness check

      const result = await markdownsService.updateMarkdown('test-id', {
        title: 'Updated Title',
        publicEnabled: true,
        status: 'published'
      });

      expect(mockDoc.save).toHaveBeenCalled();
      expect(mockDoc.title).toBe('Updated Title');
      expect(mockDoc.publicEnabled).toBe(true);
      expect(mockDoc.status).toBe('published');
      expect(result).toEqual({
        _id: 'test-id',
        title: 'Updated Title',
        category: 'docs',
        group_code: 'api',
        slug: 'endpoints',
        publicEnabled: true,
        status: 'published'
      });
    });

    test('throws error for not found', async () => {
      Markdown.findById.mockResolvedValue(null);

      await expect(markdownsService.updateMarkdown('nonexistent-id', {}))
        .rejects.toThrow('Markdown not found');
    });

    test('validates status values', async () => {
      const mockDoc = {
        _id: 'test-id',
        title: 'Test',
        save: jest.fn().mockResolvedValue(true)
      };

      Markdown.findById.mockResolvedValue(mockDoc);

      await expect(markdownsService.updateMarkdown('test-id', { status: 'invalid' }))
        .rejects.toThrow('Invalid status');
    });

    test('validates title when provided', async () => {
      const mockDoc = {
        _id: 'test-id',
        title: 'Original Title',
        save: jest.fn().mockResolvedValue(true)
      };

      Markdown.findById.mockResolvedValue(mockDoc);

      await expect(markdownsService.updateMarkdown('test-id', { title: '' }))
        .rejects.toThrow('title is required');
    });
  });

  describe('deleteMarkdown', () => {
    test('deletes markdown successfully', async () => {
      const mockDoc = {
        _id: 'test-id',
        category: 'docs',
        group_code: 'api',
        slug: 'endpoints'
      };

      mockFindByIdAndDeleteWithLean(mockDoc);

      const result = await markdownsService.deleteMarkdown('test-id');
      expect(result).toEqual({ success: true });
      expect(Markdown.findByIdAndDelete).toHaveBeenCalledWith('test-id');
    });

    test('throws error for not found', async () => {
      mockFindByIdAndDeleteWithLean(null);

      await expect(markdownsService.deleteMarkdown('nonexistent-id'))
        .rejects.toThrow('Markdown not found');
    });
  });

  describe('listMarkdowns', () => {
    test('lists markdowns with filters', async () => {
      const mockItems = [
        { _id: '1', title: 'Doc 1', category: 'docs' },
        { _id: '2', title: 'Doc 2', category: 'docs' }
      ];
      
      mockFindWithLean(mockItems);
      Markdown.countDocuments.mockResolvedValue(2);

      const result = await markdownsService.listMarkdowns(
        { category: 'docs', status: 'published' },
        { page: 1, limit: 10 }
      );

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(10);
      expect(Markdown.find).toHaveBeenCalledWith({
        category: 'docs',
        status: 'published'
      });
    });

    test('applies search filter', async () => {
      mockFindWithLean([]);
      Markdown.countDocuments.mockResolvedValue(0);

      await markdownsService.listMarkdowns(
        { search: 'test' },
        { page: 1, limit: 10 }
      );

      expect(Markdown.find).toHaveBeenCalledWith({
        status: 'published',
        $or: [
          { title: { $regex: 'test', $options: 'i' } },
          { markdownRaw: { $regex: 'test', $options: 'i' } }
        ]
      });
    });

    test('applies pagination correctly', async () => {
      mockFindWithLean([]);
      Markdown.countDocuments.mockResolvedValue(0);

      await markdownsService.listMarkdowns(
        {},
        { page: 2, limit: 20 }
      );

      expect(Markdown.find().skip).toHaveBeenCalledWith(20);
      expect(Markdown.find().limit).toHaveBeenCalledWith(20);
    });
  });

  describe('getMarkdownTree', () => {
    test('builds tree structure correctly', async () => {
      const mockDocs = [
        { group_code: 'folder1__folder2', slug: 'file1', title: 'File 1' },
        { group_code: 'folder1', slug: 'file2', title: 'File 2' },
        { group_code: '', slug: 'root', title: 'Root File' }
      ];

      Markdown.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockDocs)
      });

      const result = await markdownsService.getMarkdownTree('docs');

      expect(result).toEqual({
        folder1: {
          _type: 'folder',
          children: {
            folder2: {
              _type: 'folder',
              children: {
                file1: {
                  _type: 'file',
                  title: 'File 1',
                  slug: 'file1',
                  group_code: 'folder1__folder2'
                }
              }
            },
            file2: {
              _type: 'file',
              title: 'File 2',
              slug: 'file2',
              group_code: 'folder1'
            }
          }
        },
        root: {
          _type: 'file',
          title: 'Root File',
          slug: 'root',
          group_code: ''
        }
      });
    });

    test('handles empty category', async () => {
      const result = await markdownsService.getMarkdownTree('');
      expect(result).toEqual({});
    });
  });

  describe('getFolderContents', () => {
    test('gets folder contents with exact matching', async () => {
      const mockItems = [
        { _id: '1', title: 'File 1', slug: 'file1', group_code: 'foo' }
      ];

      mockFindWithLean(mockItems);
      Markdown.countDocuments.mockResolvedValue(1);

      const result = await markdownsService.getFolderContents('docs', 'foo');

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(1);
      expect(Markdown.find).toHaveBeenCalledWith({
        category: 'docs',
        group_code: 'foo',  // Exact match, not regex
        status: 'published'
      });
    });

    test('handles empty folder correctly', async () => {
      mockFindWithLean([]);
      Markdown.countDocuments.mockResolvedValue(0);

      const result = await markdownsService.getFolderContents('docs', 'foo');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(Markdown.find).toHaveBeenCalledWith({
        category: 'docs',
        group_code: 'foo',
        status: 'published'
      });
    });

    test('handles category root correctly', async () => {
      mockFindWithLean([]);
      Markdown.countDocuments.mockResolvedValue(0);

      const result = await markdownsService.getFolderContents('docs', '');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(Markdown.find).toHaveBeenCalledWith({
        category: 'docs',
        group_code: '',
        status: 'published'
      });
    });

    test('shows root-level files only', async () => {
      const mockItems = [
        { _id: '1', title: 'Root File 1', slug: 'root1', group_code: '' },
        { _id: '2', title: 'Root File 2', slug: 'root2', group_code: '' }
      ];

      mockFindWithLean(mockItems);
      Markdown.countDocuments.mockResolvedValue(2);

      const result = await markdownsService.getFolderContents('docs', '');

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(2);
      expect(Markdown.find).toHaveBeenCalledWith({
        category: 'docs',
        group_code: '',
        status: 'published'
      });
    });
  });

  describe('getUniqueGroupCodes', () => {
    test('gets unique group codes for category', async () => {
      const mockGroupCodes = ['foo', 'foo__bar', 'api', 'api__endpoints'];
      Markdown.distinct.mockResolvedValue(mockGroupCodes);

      const result = await markdownsService.getUniqueGroupCodes('docs');

      expect(result).toEqual(mockGroupCodes);
      expect(Markdown.distinct).toHaveBeenCalledWith('group_code', {
        category: 'docs',
        status: 'published'
      });
    });

    test('filters empty group codes', async () => {
      const mockGroupCodes = ['foo', '', 'bar', ''];
      Markdown.distinct.mockResolvedValue(mockGroupCodes);

      const result = await markdownsService.getUniqueGroupCodes('docs');

      expect(result).toEqual(['foo', 'bar']);
    });

    test('handles admin mode', async () => {
      const mockGroupCodes = ['foo', 'bar'];
      Markdown.distinct.mockResolvedValue(mockGroupCodes);

      await markdownsService.getUniqueGroupCodes('docs', { isAdmin: true });

      expect(Markdown.distinct).toHaveBeenCalledWith('group_code', {
        category: 'docs'
      });
    });
  });

  describe('searchMarkdowns', () => {
    test('searches markdowns with query', async () => {
      const mockResults = [
        { title: 'API Doc', slug: 'api', category: 'docs' }
      ];

      Markdown.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockResults)
      });

      const result = await markdownsService.searchMarkdowns('api', { category: 'docs' });

      expect(result).toEqual(mockResults);
      expect(Markdown.find).toHaveBeenCalledWith({
        status: 'published',
        publicEnabled: true,
        category: 'docs',
        $or: [
          { title: { $regex: 'api', $options: 'i' } },
          { markdownRaw: { $regex: 'api', $options: 'i' } }
        ]
      });
    });

    test('applies limit', async () => {
      Markdown.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      await markdownsService.searchMarkdowns('test', { limit: 25 });

      expect(Markdown.find().limit).toHaveBeenCalledWith(25);
    });
  });
});
