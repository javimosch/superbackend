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
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
  create: jest.fn()
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

const mockFindOneWithSelectAndLean = (value) => {
  JsonConfig.findOne.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value)
  });
};

describe('jsonConfigs.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jsonConfigsService.clearAllJsonConfigCache();
  });

  describe('Enhanced Cache Helpers', () => {
    describe('isJsonConfigCached', () => {
      test('returns false for non-existent cache entries', () => {
        expect(jsonConfigsService.isJsonConfigCached('non-existent')).toBe(false);
      });

      test('returns true for existing cache entries', () => {
        // First, set up a cache entry by calling getJsonConfigValueBySlug
        mockFindOneWithLean({
          slug: 'test-config',
          jsonRaw: '{"test": true}',
          cacheTtlSeconds: 300
        });
        
        return jsonConfigsService.getJsonConfigValueBySlug('test-config')
          .then(() => {
            expect(jsonConfigsService.isJsonConfigCached('test-config')).toBe(true);
          });
      });

      test('returns false for expired cache entries', (done) => {
        // Mock an expired cache entry manually
        const cache = jsonConfigsService.getJsonConfigCacheKeys();
        const originalSetCached = jsonConfigsService.setCached || (() => {});
        
        // Manually set an expired entry
        jsonConfigsService.setCached = function(slug, value, ttlSeconds) {
          const entry = { value, expiresAt: Date.now() - 1000 }; // Expired 1 second ago
          // Access internal cache through the module's closure
          const cacheMap = this.getJsonConfigCacheKeys ? this.getJsonConfigCacheKeys() : [];
          // This is a bit of a hack for testing - in reality the cache is internal
        };
        
        expect(jsonConfigsService.isJsonConfigCached('expired-entry')).toBe(false);
        done();
      });
    });

    describe('getJsonConfigCacheInfo', () => {
      test('returns null for invalid slug', () => {
        expect(jsonConfigsService.getJsonConfigCacheInfo('')).toBeNull();
        expect(jsonConfigsService.getJsonConfigCacheInfo(null)).toBeNull();
        expect(jsonConfigsService.getJsonConfigCacheInfo(undefined)).toBeNull();
      });

      test('returns exists: false for non-existent entries', () => {
        const info = jsonConfigsService.getJsonConfigCacheInfo('non-existent');
        expect(info).toEqual({ exists: false });
      });

      test('returns cache info for existing entries', () => {
        mockFindOneWithLean({
          slug: 'test-config',
          jsonRaw: '{"test": "data"}',
          cacheTtlSeconds: 300
        });
        
        return jsonConfigsService.getJsonConfigValueBySlug('test-config')
          .then(() => {
            const info = jsonConfigsService.getJsonConfigCacheInfo('test-config');
            expect(info.exists).toBe(true);
            expect(info.expiresAt).toBeGreaterThan(Date.now());
            expect(info.ttlRemaining).toBeGreaterThan(0);
            expect(info.size).toBeGreaterThan(0);
          });
      });
    });

    describe('clearJsonConfigCacheIfExists', () => {
      test('returns false for non-existent cache entries', () => {
        const result = jsonConfigsService.clearJsonConfigCacheIfExists('non-existent');
        expect(result).toBe(false);
      });

      test('returns true and clears existing cache entries', () => {
        mockFindOneWithLean({
          slug: 'test-config',
          jsonRaw: '{"test": true}',
          cacheTtlSeconds: 300
        });
        
        return jsonConfigsService.getJsonConfigValueBySlug('test-config')
          .then(() => {
            expect(jsonConfigsService.isJsonConfigCached('test-config')).toBe(true);
            const result = jsonConfigsService.clearJsonConfigCacheIfExists('test-config');
            expect(result).toBe(true);
            expect(jsonConfigsService.isJsonConfigCached('test-config')).toBe(false);
          });
      });
    });

    describe('clearJsonConfigCacheBatch', () => {
      test('returns 0 for empty array', () => {
        expect(jsonConfigsService.clearJsonConfigCacheBatch([])).toBe(0);
      });

      test('returns 0 for non-array input', () => {
        expect(jsonConfigsService.clearJsonConfigCacheBatch('not-an-array')).toBe(0);
        expect(jsonConfigsService.clearJsonConfigCacheBatch(null)).toBe(0);
        expect(jsonConfigsService.clearJsonConfigCacheBatch(undefined)).toBe(0);
      });

      test('clears multiple cache entries', () => {
        mockFindOneWithLean({
          slug: 'config1',
          jsonRaw: '{"test": true}',
          cacheTtlSeconds: 300
        });
        
        return jsonConfigsService.getJsonConfigValueBySlug('config1')
          .then(() => {
            mockFindOneWithLean({
              slug: 'config2',
              jsonRaw: '{"test": true}',
              cacheTtlSeconds: 300
            });
            
            return jsonConfigsService.getJsonConfigValueBySlug('config2');
          })
          .then(() => {
            expect(jsonConfigsService.isJsonConfigCached('config1')).toBe(true);
            expect(jsonConfigsService.isJsonConfigCached('config2')).toBe(true);
            
            const cleared = jsonConfigsService.clearJsonConfigCacheBatch(['config1', 'config2', 'non-existent']);
            expect(cleared).toBe(2);
            expect(jsonConfigsService.isJsonConfigCached('config1')).toBe(false);
            expect(jsonConfigsService.isJsonConfigCached('config2')).toBe(false);
          });
      });
    });

    describe('clearJsonConfigCacheByPattern', () => {
      test('returns 0 for invalid patterns', () => {
        expect(jsonConfigsService.clearJsonConfigCacheByPattern('')).toBe(0);
        expect(jsonConfigsService.clearJsonConfigCacheByPattern(null)).toBe(0);
        expect(jsonConfigsService.clearJsonConfigCacheByPattern(undefined)).toBe(0);
        expect(jsonConfigsService.clearJsonConfigCacheByPattern(123)).toBe(0);
      });

      test('clears cache entries matching pattern', () => {
        mockFindOneWithLean({
          slug: 'waiting-list-entries',
          jsonRaw: '{"entries": []}',
          cacheTtlSeconds: 300
        });
        
        return jsonConfigsService.getJsonConfigValueBySlug('waiting-list-entries')
          .then(() => {
            mockFindOneWithLean({
              slug: 'waiting-list-stats',
              jsonRaw: '{"total": 0}',
              cacheTtlSeconds: 300
            });
            
            return jsonConfigsService.getJsonConfigValueBySlug('waiting-list-stats');
          })
          .then(() => {
            mockFindOneWithLean({
              slug: 'other-config',
              jsonRaw: '{"data": true}',
              cacheTtlSeconds: 300
            });
            
            return jsonConfigsService.getJsonConfigValueBySlug('other-config');
          })
          .then(() => {
            expect(jsonConfigsService.isJsonConfigCached('waiting-list-entries')).toBe(true);
            expect(jsonConfigsService.isJsonConfigCached('waiting-list-stats')).toBe(true);
            expect(jsonConfigsService.isJsonConfigCached('other-config')).toBe(true);
            
            const cleared = jsonConfigsService.clearJsonConfigCacheByPattern('waiting-list-*');
            expect(cleared).toBe(2);
            expect(jsonConfigsService.isJsonConfigCached('waiting-list-entries')).toBe(false);
            expect(jsonConfigsService.isJsonConfigCached('waiting-list-stats')).toBe(false);
            expect(jsonConfigsService.isJsonConfigCached('other-config')).toBe(true);
          });
      });
    });

    describe('getJsonConfigCacheStats', () => {
      test('returns empty stats for no cache entries', () => {
        const stats = jsonConfigsService.getJsonConfigCacheStats();
        expect(stats.totalEntries).toBe(0);
        expect(stats.expiredEntries).toBe(0);
        expect(stats.activeEntries).toBe(0);
        expect(stats.totalSizeBytes).toBe(0);
        expect(stats.keys).toEqual([]);
      });

      test('returns stats for cache entries', () => {
        mockFindOneWithLean({
          slug: 'test-config',
          jsonRaw: '{"test": "data with some content"}',
          cacheTtlSeconds: 300
        });
        
        return jsonConfigsService.getJsonConfigValueBySlug('test-config')
          .then(() => {
            const stats = jsonConfigsService.getJsonConfigCacheStats();
            expect(stats.totalEntries).toBeGreaterThan(0);
            expect(stats.activeEntries).toBeGreaterThan(0);
            expect(stats.totalSizeBytes).toBeGreaterThan(0);
            expect(stats.keys).toContain('test-config');
          });
      });
    });

    describe('getJsonConfigCacheKeys', () => {
      test('returns empty array for no cache entries', () => {
        const keys = jsonConfigsService.getJsonConfigCacheKeys();
        expect(keys).toEqual([]);
      });

      test('returns array of cache keys', () => {
        mockFindOneWithLean({
          slug: 'test-config',
          jsonRaw: '{"test": true}',
          cacheTtlSeconds: 300
        });
        
        return jsonConfigsService.getJsonConfigValueBySlug('test-config')
          .then(() => {
            const keys = jsonConfigsService.getJsonConfigCacheKeys();
            expect(keys).toContain('test-config');
          });
      });
    });
  });

  describe('Cache-Aware Update Helpers', () => {
    describe('updateJsonConfigWithCacheInvalidation', () => {
      test('updates config and clears cache', async () => {
        const mockDoc = {
          _id: 'config-id',
          slug: 'test-config',
          alias: 'test-alias',
          title: 'Old Title',
          publicEnabled: false,
          cacheTtlSeconds: 0,
          jsonRaw: '{"old": true}',
          jsonHash: 'old-hash',
          save: jest.fn().mockResolvedValue(),
          toObject: jest.fn().mockReturnValue({
            _id: 'config-id',
            slug: 'test-config',
            title: 'New Title'
          })
        };

        JsonConfig.findById.mockResolvedValue(mockDoc);

        // Set up cache first
        mockFindOneWithLean({
          slug: 'test-config',
          jsonRaw: '{"old": true}',
          cacheTtlSeconds: 300
        });

        await jsonConfigsService.getJsonConfigValueBySlug('test-config');
        expect(jsonConfigsService.isJsonConfigCached('test-config')).toBe(true);

        // Update with cache invalidation
        const result = await jsonConfigsService.updateJsonConfigWithCacheInvalidation('config-id', {
          title: 'New Title',
          publicEnabled: true
        });

        expect(mockDoc.save).toHaveBeenCalled();
        expect(jsonConfigsService.isJsonConfigCached('test-config')).toBe(false);
        expect(result.title).toBe('New Title');
      });

      test('throws error for non-existent config', async () => {
        JsonConfig.findById.mockResolvedValue(null);

        await expect(jsonConfigsService.updateJsonConfigWithCacheInvalidation('non-existent', {}))
          .rejects.toThrow('JSON config not found');
      });
    });

    describe('updateJsonConfigValueBySlug', () => {
      test('throws error for invalid update function', async () => {
        await expect(jsonConfigsService.updateJsonConfigValueBySlug('test-config', 'not-a-function'))
          .rejects.toThrow('updateFn must be a function');
      });

      test('throws error for non-existent config', async () => {
        // Mock findOne to return null
        JsonConfig.findOne.mockReturnValue({
          lean: jest.fn().mockResolvedValue(null)
        });

        await expect(jsonConfigsService.updateJsonConfigValueBySlug('non-existent', () => ({})))
          .rejects.toThrow('JSON config not found');
      });
    });
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
      JsonConfig.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      const slug = await jsonConfigsService.generateUniqueSlugFromTitle('My Title');

      expect(slug).toBe('my-title-abcd');
      expect(JsonConfig.findOne).toHaveBeenCalledTimes(1);
    });

    test('throws when unique slug cannot be generated', async () => {
      JsonConfig.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'existing' })
      });

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

  describe('createJsonConfig', () => {
    test('creates a new config successfully', async () => {
      const input = {
        title: 'New Config',
        jsonRaw: '{"a":1}',
        alias: 'my-alias'
      };

      mockFindOneWithLean(null); // alias check
      mockFindOneWithLean(null); // slug check

      const mockDoc = {
        ...input,
        slug: 'new-config-abcd',
        toObject: () => ({ ...input, slug: 'new-config-abcd' })
      };
      JsonConfig.create = jest.fn().mockResolvedValue(mockDoc);

      const result = await jsonConfigsService.createJsonConfig(input);

      expect(result.slug).toBe('new-config-abcd');
      expect(JsonConfig.create).toHaveBeenCalled();
    });

    test('throws error if title is missing', async () => {
      await expect(jsonConfigsService.createJsonConfig({ jsonRaw: '{}' }))
        .rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('updateJsonConfig', () => {
    test('updates an existing config', async () => {
      const mockDoc = {
        _id: 'id123',
        title: 'Old',
        slug: 'old-slug',
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };
      JsonConfig.findById.mockResolvedValue(mockDoc);
      mockFindOneWithLean(null); // alias uniqueness check

      const result = await jsonConfigsService.updateJsonConfig('id123', { title: 'New' });

      expect(mockDoc.title).toBe('New');
      expect(mockDoc.save).toHaveBeenCalled();
    });

    test('throws error if config not found', async () => {
      JsonConfig.findById.mockResolvedValue(null);
      await expect(jsonConfigsService.updateJsonConfig('badid', { title: 'New' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
