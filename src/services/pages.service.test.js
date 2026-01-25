jest.mock('./jsonConfigs.service', () => ({
  getJsonConfigValueBySlug: jest.fn(),
}));

jest.mock('../models/Page', () => ({
  findOne: jest.fn()
}));

jest.mock('../models/PageCollection', () => ({
  findOne: jest.fn()
}));

const Page = require('../models/Page');
const PageCollection = require('../models/PageCollection');
const pagesService = require('./pages.service');

describe('pages.service', () => {
  describe('validateBlocks', () => {
    test('accepts valid blocks with id/type/props', () => {
      const schema = pagesService.getDefaultBlocksSchema();
      expect(() => pagesService.validateBlocks([
        { id: 'b1', type: 'hero', props: { title: 'Hi', subtitle: 'There', ctaText: 'Go', ctaUrl: '/go' } },
        { id: 'b2', type: 'text', props: { title: 'T', content: '<p>x</p>' } },
      ], schema)).not.toThrow();
    });

    test('rejects when blocks is not an array', () => {
      const schema = pagesService.getDefaultBlocksSchema();
      expect(() => pagesService.validateBlocks('nope', schema)).toThrow('blocks must be an array');
    });

    test('rejects block missing id', () => {
      const schema = pagesService.getDefaultBlocksSchema();
      expect(() => pagesService.validateBlocks([
        { type: 'hero', props: {} },
      ], schema)).toThrow('Each block must have an id');
    });

    test('rejects unknown block type', () => {
      const schema = pagesService.getDefaultBlocksSchema();
      expect(() => pagesService.validateBlocks([
        { id: 'b1', type: 'unknown', props: {} },
      ], schema)).toThrow('Unknown block type');
    });

    test('rejects invalid props type', () => {
      const schema = pagesService.getDefaultBlocksSchema();
      expect(() => pagesService.validateBlocks([
        { id: 'b1', type: 'hero', props: 'nope' },
      ], schema)).toThrow('Block props must be an object');
    });

    test('validates basic field types (boolean/select)', () => {
      const schema = pagesService.getDefaultBlocksSchema();

      expect(() => pagesService.validateBlocks([
        { id: 'b1', type: 'image', props: { fullWidth: true, align: 'center' } },
      ], schema)).not.toThrow();

      expect(() => pagesService.validateBlocks([
        { id: 'b1', type: 'image', props: { fullWidth: 'true' } },
      ], schema)).toThrow('must be a boolean');

      expect(() => pagesService.validateBlocks([
        { id: 'b1', type: 'image', props: { align: 'bogus' } },
      ], schema)).toThrow('must be one of');
    });
  });

  describe('slug and route path logic', () => {
    test('validateSlug throws on empty or invalid slugs', () => {
      expect(() => pagesService.validateSlug('')).toThrow('Slug is required');
      expect(() => pagesService.validateSlug('Invalid Slug!')).toThrow('Slug must be lowercase alphanumeric with hyphens only');
      expect(pagesService.validateSlug('valid-slug')).toBe('valid-slug');
    });

    test('isReservedSegment correctly identifies reserved words', () => {
      expect(pagesService.isReservedSegment('api')).toBe(true);
      expect(pagesService.isReservedSegment('admin')).toBe(true);
      expect(pagesService.isReservedSegment('my-page')).toBe(false);
    });

    test('buildRoutePath constructs correct URLs', () => {
      expect(pagesService.buildRoutePath('/', null, 'home')).toBe('/home');
      expect(pagesService.buildRoutePath('/pages', 'blog', 'post-1')).toBe('/pages/blog/post-1');
    });
  });

  describe('findPageByRoutePath', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('finds page at root level', async () => {
      const mockPage = { slug: 'home', _id: 'p1' };
      Page.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockPage) });

      const result = await pagesService.findPageByRoutePath('/home');

      expect(result.slug).toBe('home');
      expect(result._routePath).toBe('/home');
    });

    test('finds page within collection', async () => {
      const mockCollection = { _id: 'c1', slug: 'blog' };
      const mockPage = { slug: 'post-1', _id: 'p2', collectionId: 'c1' };
      
      PageCollection.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockCollection) });
      Page.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockPage) });

      const result = await pagesService.findPageByRoutePath('/blog/post-1');

      expect(result.slug).toBe('post-1');
      expect(result._collection).toEqual(mockCollection);
      expect(result._routePath).toBe('/blog/post-1');
    });

    test('returns null if segments empty', async () => {
      expect(await pagesService.findPageByRoutePath('/')).toBeNull();
    });
  });
});
