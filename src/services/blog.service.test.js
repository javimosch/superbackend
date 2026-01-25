jest.mock('../models/BlogPost', () => ({
  findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn() })) }))
}));

const BlogPost = require('../models/BlogPost');
const {
  slugify,
  extractExcerptFromMarkdown,
  generateUniqueBlogSlug,
  normalizeTags,
  parsePagination
} = require('./blog.service');

describe('blog.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('slugify', () => {
    test('converts titles to URL-friendly slugs', () => {
      expect(slugify('Hello World!')).toBe('hello-world');
      expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
      expect(slugify('Crème brûlée')).toBe('creme-brulee');
      expect(slugify('Special #$%^& Characters')).toBe('special-characters');
      expect(slugify('Multiple---Hyphens')).toBe('multiple-hyphens');
      expect(slugify('')).toBe('');
      expect(slugify(null)).toBe('');
      expect(slugify(undefined)).toBe('');
    });

    test('handles edge cases', () => {
      expect(slugify('---')).toBe('');
      expect(slugify('   ')).toBe('');
      expect(slugify('123')).toBe('123');
      expect(slugify('Test123')).toBe('test123');
    });
  });

  describe('extractExcerptFromMarkdown', () => {
    test('extracts plain text from markdown', () => {
      const markdown = `# Title

This is a **bold** text with some code \`console.log()\` and an image ![alt](url).

\`\`\`javascript
const code = 'block';
\`\`\`

More text with a [link](http://example.com).`;
      
      const excerpt = extractExcerptFromMarkdown(markdown);
      
      expect(excerpt).toBe('Title This is a bold text with some code and an image . More text with a .');
    });

    test('truncates long content', () => {
      const longText = 'This is a very long text that should be truncated because it exceeds the maximum length allowed for an excerpt which is 180 characters.';
      const markdown = `# Post\n\n${longText}`;
      
      const excerpt = extractExcerptFromMarkdown(markdown);
      
      expect(excerpt).toBe('Post This is a very long text that should be truncated because it exceeds the maximum length allowed for an excerpt which is 180 characters.');
    });

    test('handles empty input', () => {
      expect(extractExcerptFromMarkdown('')).toBe('');
      expect(extractExcerptFromMarkdown(null)).toBe('');
      expect(extractExcerptFromMarkdown(undefined)).toBe('');
    });

    test('removes code blocks and inline code', () => {
      const markdown = 'Text with \`inline code\` and\n\n```javascript\nconst block = "code";\n```\n\nMore text.';
      
      const excerpt = extractExcerptFromMarkdown(markdown);
      
      expect(excerpt).toBe('Text with and More text.');
    });
  });

  describe('generateUniqueBlogSlug', () => {
    test('generates unique slug for new post', async () => {
      BlogPost.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      
      const slug = await generateUniqueBlogSlug('My Test Post');
      
      expect(slug).toBe('my-test-post');
      expect(BlogPost.findOne).toHaveBeenCalledWith({
        slug: 'my-test-post',
        status: { $in: ['draft', 'scheduled', 'published'] }
      });
    });

    test('adds suffix when slug exists', async () => {
      BlogPost.findOne
        .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'existing' }) }) })
        .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      
      const slug = await generateUniqueBlogSlug('My Test Post');
      
      expect(slug).toBe('my-test-post-2');
    });

    test('excludes specific ID from check', async () => {
      BlogPost.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      
      await generateUniqueBlogSlug('My Test Post', { excludeId: 'post123' });
      
      expect(BlogPost.findOne).toHaveBeenCalledWith({
        slug: 'my-test-post',
        status: { $in: ['draft', 'scheduled', 'published'] },
        _id: { $ne: 'post123' }
      });
    });

    test('handles empty title', async () => {
      BlogPost.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      
      const slug = await generateUniqueBlogSlug('');
      
      expect(slug).toBe('post');
    });

    test('increments suffix until unique', async () => {
      BlogPost.findOne
        .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: '1' }) }) })
        .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: '2' }) }) })
        .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      
      const slug = await generateUniqueBlogSlug('Test');
      
      expect(slug).toBe('test-3');
    });
  });

  describe('normalizeTags', () => {
    test('normalizes array of tags', () => {
      const tags = ['JavaScript', 'Node.js', '  React  ', 'JavaScript', 'node.js'];
      
      const normalized = normalizeTags(tags);
      
      expect(normalized).toEqual(['JavaScript', 'Node.js', 'React']);
    });

    test('handles comma-separated string', () => {
      const tags = 'JavaScript, Node.js,  React  , JavaScript';
      
      const normalized = normalizeTags(tags);
      
      expect(normalized).toEqual(['JavaScript', 'Node.js', 'React']);
    });

    test('handles null/undefined', () => {
      expect(normalizeTags(null)).toEqual([]);
      expect(normalizeTags(undefined)).toEqual([]);
    });

    test('trims long tags', () => {
      const tags = ['This is a very long tag that exceeds the maximum length'];
      
      const normalized = normalizeTags(tags);
      
      expect(normalized[0]).toHaveLength(40);
      expect(normalized[0]).toBe('This is a very long tag that exceeds the');
    });

    test('limits number of tags', () => {
      const tags = Array(30).fill(0).map((_, i) => `tag${i}`);
      
      const normalized = normalizeTags(tags);
      
      expect(normalized).toHaveLength(25);
    });

    test('handles single value', () => {
      const normalized = normalizeTags('JavaScript');
      
      expect(normalized).toEqual(['JavaScript']);
    });
  });

  describe('parsePagination', () => {
    test('parses pagination parameters', () => {
      const result = parsePagination({ page: 2, limit: 10 });
      
      expect(result).toEqual({
        page: 2,
        limit: 10,
        skip: 10
      });
    });

    test('uses defaults', () => {
      const result = parsePagination({});
      
      expect(result).toEqual({
        page: 1,
        limit: 20,
        skip: 0
      });
    });

    test('clamps values', () => {
      const result = parsePagination({ page: 0, limit: 200, maxLimit: 100 });
      
      expect(result).toEqual({
        page: 1,
        limit: 100,
        skip: 0
      });
    });

    test('handles invalid input', () => {
      const result = parsePagination({ page: 'invalid', limit: 'invalid' });
      
      expect(result).toEqual({
        page: 1,
        limit: 20,
        skip: 0
      });
    });

    test('custom default limit', () => {
      const result = parsePagination({ defaultLimit: 50 });
      
      expect(result.limit).toBe(50);
    });
  });
});
