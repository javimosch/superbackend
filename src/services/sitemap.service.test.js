const { generateSitemapXml, generateRobotsTxt } = require('./sitemap.service');
const Page = require('../models/Page');
const PageCollection = require('../models/PageCollection');

jest.mock('../models/Page');
jest.mock('../models/PageCollection');

describe('sitemap.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRobotsTxt', () => {
    test('generates basic robots.txt', () => {
      const result = generateRobotsTxt({ baseUrl: 'https://example.com' });
      expect(result).toBe('User-agent: *\nDisallow:\n\nSitemap: https://example.com/sitemap.xml\n');
    });

    test('includes disallow paths', () => {
      const result = generateRobotsTxt({
        baseUrl: 'https://example.com',
        disallow: ['/admin', '/api']
      });
      expect(result).toBe('User-agent: *\nDisallow: /admin\nDisallow: /api\n\nSitemap: https://example.com/sitemap.xml\n');
    });

    test('uses custom sitemap path', () => {
      const result = generateRobotsTxt({
        baseUrl: 'https://example.com',
        sitemapPath: '/custom-sitemap.xml'
      });
      expect(result).toContain('Sitemap: https://example.com/custom-sitemap.xml');
    });

    test('omits sitemap line when baseUrl is missing', () => {
      const result = generateRobotsTxt({});
      expect(result).not.toContain('Sitemap:');
    });

    test('handles no baseUrl and no disallow', () => {
      const result = generateRobotsTxt();
      expect(result).toContain('User-agent: *');
      expect(result).toContain('Disallow:');
    });

    test('handles empty disallow array', () => {
      const result = generateRobotsTxt({ baseUrl: 'https://example.com', disallow: [] });
      expect(result).toContain('Disallow:\n');
    });

    test('normalizes trailing slash on baseUrl', () => {
      const result = generateRobotsTxt({ baseUrl: 'https://example.com//' });
      expect(result).toContain('Sitemap: https://example.com/sitemap.xml');
    });
  });

  describe('generateSitemapXml', () => {
    test('throws when baseUrl is missing', async () => {
      await expect(generateSitemapXml({})).rejects.toThrow('baseUrl is required');
    });

    test('generates sitemap xml with published pages', async () => {
      const mockPages = [
        {
          _id: 'p1',
          slug: 'home',
          status: 'published',
          isGlobal: true,
          updatedAt: new Date('2024-01-01'),
          seoMeta: { sitemapPriority: '0.8', sitemapChangefreq: 'daily' },
          collectionId: null
        },
        {
          _id: 'p2',
          slug: 'about',
          status: 'published',
          isGlobal: true,
          updatedAt: new Date('2024-01-02'),
          seoMeta: {},
          collectionId: null
        }
      ];

      Page.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockPages)
        })
      });
      PageCollection.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      const xml = await generateSitemapXml({ baseUrl: 'https://example.com' });

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain('<loc>https://example.com/home</loc>');
      expect(xml).toContain('<loc>https://example.com/about</loc>');
      expect(xml).toContain('<priority>0.8</priority>');
      expect(xml).toContain('<priority>0.5</priority>');
      expect(xml).toContain('<changefreq>daily</changefreq>');
      expect(xml).toContain('<changefreq>weekly</changefreq>');
      expect(xml).toContain('</urlset>');
    });

    test('skips repeat template pages (slug === "_")', async () => {
      const mockPages = [
        {
          _id: 'p1',
          slug: '_',
          status: 'published',
          isGlobal: true,
          updatedAt: new Date(),
          seoMeta: {},
          collectionId: null
        },
        {
          _id: 'p2',
          slug: 'real-page',
          status: 'published',
          isGlobal: true,
          updatedAt: new Date(),
          seoMeta: {},
          collectionId: null
        }
      ];

      Page.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockPages)
        })
      });
      PageCollection.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      const xml = await generateSitemapXml({ baseUrl: 'https://example.com' });

      expect(xml).not.toContain('/_<');
      expect(xml).toContain('/real-page');
    });

    test('includes collection slugs in paths', async () => {
      const mockPages = [
        {
          _id: 'p1',
          slug: 'my-page',
          status: 'published',
          isGlobal: true,
          updatedAt: new Date(),
          seoMeta: {},
          collectionId: 'c1'
        }
      ];

      const mockCollections = [
        { _id: 'c1', slug: 'blog', status: 'active' }
      ];

      Page.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockPages)
        })
      });
      PageCollection.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockCollections) });

      const xml = await generateSitemapXml({ baseUrl: 'https://example.com' });

      expect(xml).toContain('/blog/my-page');
    });

    test('skips pages whose collection is inactive', async () => {
      const mockPages = [
        {
          _id: 'p1',
          slug: 'orphan-page',
          status: 'published',
          isGlobal: true,
          updatedAt: new Date(),
          seoMeta: {},
          collectionId: 'nonexistent'
        }
      ];

      Page.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockPages)
        })
      });
      PageCollection.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      const xml = await generateSitemapXml({ baseUrl: 'https://example.com' });

      expect(xml).not.toContain('orphan-page');
    });

    test('escapes XML special characters in URLs', async () => {
      const mockPages = [
        {
          _id: 'p1',
          slug: "page's & stuff",
          status: 'published',
          isGlobal: true,
          updatedAt: new Date(),
          seoMeta: {},
          collectionId: null
        }
      ];

      Page.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockPages)
        })
      });
      PageCollection.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      const xml = await generateSitemapXml({ baseUrl: "https://example.com" });

      expect(xml).toContain('&amp;');
      expect(xml).not.toContain("'");
    });

    test('respects pagesPrefix', async () => {
      const mockPages = [
        {
          _id: 'p1',
          slug: 'page1',
          status: 'published',
          isGlobal: true,
          updatedAt: new Date(),
          seoMeta: {},
          collectionId: null
        }
      ];

      Page.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockPages)
        })
      });
      PageCollection.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      const xml = await generateSitemapXml({ baseUrl: 'https://example.com', pagesPrefix: '/docs' });

      expect(xml).toContain('/docs/page1');
    });

    test('handles empty published pages gracefully', async () => {
      Page.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });
      PageCollection.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      const xml = await generateSitemapXml({ baseUrl: 'https://example.com' });

      expect(xml).toContain('<urlset');
      expect(xml).toContain('</urlset>');
      expect(xml).not.toContain('<url>');
    });
  });
});
