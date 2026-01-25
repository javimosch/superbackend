jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('abcd', 'hex')),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('hash')
  }))
}));

jest.mock('../models/JsonConfig', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findById: jest.fn()
}));

const JsonConfig = require('../models/JsonConfig');
const jsonConfigsService = require('./jsonConfigs.service');

const mockFindOneWithLean = (value) => {
  JsonConfig.findOne.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value)
  });
};

const mockFindOneLeanOnly = (value) => {
  JsonConfig.findOne.mockReturnValue({
    lean: jest.fn().mockResolvedValue(value)
  });
};

describe('jsonConfigs.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jsonConfigsService.clearAllJsonConfigCache();
  });

  describe('normalizeSlugBase', () => {
    test('normalizes titles into url-safe slugs', () => {
      expect(jsonConfigsService.normalizeSlugBase('Hello World!')).toBe('hello-world');
      expect(jsonConfigsService.normalizeSlugBase('  Multiple   Spaces ')).toBe('multiple-spaces');
      expect(jsonConfigsService.normalizeSlugBase('Crème brûlée')).toBe('creme-brulee');
    });

    test('falls back to config for empty titles', () => {
      expect(jsonConfigsService.normalizeSlugBase('')).toBe('config');
      expect(jsonConfigsService.normalizeSlugBase('   ')).toBe('config');
    });
  });

  describe('parseJsonOrThrow', () => {
    test('parses valid JSON', () => {
      expect(jsonConfigsService.parseJsonOrThrow('{"ok":true}')).toEqual({ ok: true });
    });

    test('throws with INVALID_JSON code on invalid JSON', () => {
      expect(() => jsonConfigsService.parseJsonOrThrow('{invalid')).toThrow('Expected property name');
      try {
        jsonConfigsService.parseJsonOrThrow('{invalid');
      } catch (error) {
        expect(error.code).toBe('INVALID_JSON');
      }
    });
  });

  describe('generateUniqueSlugFromTitle', () => {
    test('generates slug with suffix when available', async () => {
      mockFindOneWithLean(null);

      const slug = await jsonConfigsService.generateUniqueSlugFromTitle('My Title');

      expect(slug).toBe('my-title-abcd');
      expect(JsonConfig.findOne).toHaveBeenCalledTimes(1);
    });

    test('throws when unique slug cannot be generated', async () => {
      mockFindOneWithLean({ _id: 'existing' });

      await expect(
        jsonConfigsService.generateUniqueSlugFromTitle('My Title', { maxAttempts: 2 })
      ).rejects.toThrow('Failed to generate unique slug');

      expect(JsonConfig.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('getJsonConfigValueBySlug', () => {
    test('throws validation error for empty slug', async () => {
      await expect(jsonConfigsService.getJsonConfigValueBySlug('')).rejects.toMatchObject({
        code: 'VALIDATION'
      });
    });

    test('returns cached value on subsequent calls', async () => {
      const doc = {
        slug: 'home',
        alias: null,
        cacheTtlSeconds: 30,
        jsonRaw: '{"hero":"hi"}'
      };

      mockFindOneLeanOnly(doc);

      const first = await jsonConfigsService.getJsonConfigValueBySlug('home');
      const second = await jsonConfigsService.getJsonConfigValueBySlug('home');

      expect(first).toEqual({ hero: 'hi' });
      expect(second).toEqual({ hero: 'hi' });
      expect(JsonConfig.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('getJsonConfigPublicPayload', () => {
    test('throws not found when config is not public', async () => {
      mockFindOneLeanOnly({ slug: 'private', publicEnabled: false });

      await expect(jsonConfigsService.getJsonConfigPublicPayload('private')).rejects.toMatchObject({
        code: 'NOT_FOUND'
      });
    });

    test('returns raw payload when requested', async () => {
      const publicDoc = {
        slug: 'public',
        alias: 'alias',
        title: 'Public Config',
        publicEnabled: true,
        cacheTtlSeconds: 15,
        jsonRaw: '{"name":"value"}',
        updatedAt: new Date('2024-01-01')
      };

      JsonConfig.findOne
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(publicDoc) })
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(publicDoc) });

      const payload = await jsonConfigsService.getJsonConfigPublicPayload('public', { raw: true });

      expect(payload).toMatchObject({
        slug: 'public',
        alias: 'alias',
        title: 'Public Config',
        publicEnabled: true,
        cacheTtlSeconds: 15,
        data: { name: 'value' }
      });
    });
  });
});
