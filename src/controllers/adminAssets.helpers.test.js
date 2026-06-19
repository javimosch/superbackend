const { buildPublicUrl, formatAssetResponse, normalizeTags } = require('./adminAssets.controller')._testHelpers;

describe('adminAssets.controller helpers', () => {
  describe('buildPublicUrl', () => {
    test('builds public URL from key', () => {
      expect(buildPublicUrl('test-key')).toBe('/public/assets/test-key');
    });

    test('handles keys with special characters', () => {
      expect(buildPublicUrl('test-key-123')).toBe('/public/assets/test-key-123');
    });

    test('handles keys with slashes', () => {
      expect(buildPublicUrl('folder/test-key')).toBe('/public/assets/folder/test-key');
    });
  });

  describe('formatAssetResponse', () => {
    test('formats asset object correctly', () => {
      const asset = {
        _id: '123',
        key: 'test-key',
        provider: 's3',
        bucket: 'test-bucket',
        originalName: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'private',
        namespace: 'default',
        visibilityEnforced: false,
        tags: ['tag1', 'tag2'],
        ownerUserId: 'user1',
        orgId: 'org1',
        status: 'uploaded',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const result = formatAssetResponse(asset);

      expect(result).toEqual({
        _id: '123',
        key: 'test-key',
        provider: 's3',
        bucket: 'test-bucket',
        originalName: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'private',
        namespace: 'default',
        visibilityEnforced: false,
        tags: ['tag1', 'tag2'],
        ownerUserId: 'user1',
        orgId: 'org1',
        status: 'uploaded',
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      });
    });

    test('includes publicUrl for public assets', () => {
      const asset = {
        _id: '123',
        key: 'test-key',
        provider: 's3',
        bucket: 'test-bucket',
        originalName: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'public',
        namespace: 'default',
        visibilityEnforced: false,
        tags: [],
        ownerUserId: 'user1',
        orgId: 'org1',
        status: 'uploaded',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const result = formatAssetResponse(asset);

      expect(result.publicUrl).toBe('/public/assets/test-key');
    });

    test('handles asset with toObject method', () => {
      const asset = {
        _id: '123',
        key: 'test-key',
        provider: 's3',
        bucket: 'test-bucket',
        originalName: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'private',
        namespace: 'default',
        visibilityEnforced: false,
        tags: [],
        ownerUserId: 'user1',
        orgId: 'org1',
        status: 'uploaded',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        toObject: function() {
          return { ...this };
        },
      };

      const result = formatAssetResponse(asset);

      expect(result._id).toBe('123');
      expect(result.key).toBe('test-key');
    });

    test('includes storageExists when present', () => {
      const asset = {
        _id: '123',
        key: 'test-key',
        provider: 's3',
        bucket: 'test-bucket',
        originalName: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'private',
        namespace: 'default',
        visibilityEnforced: false,
        tags: [],
        ownerUserId: 'user1',
        orgId: 'org1',
        status: 'uploaded',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        storageExists: true,
      };

      const result = formatAssetResponse(asset);

      expect(result.storageExists).toBe(true);
    });

    test('includes storageCheckedBackend when present', () => {
      const asset = {
        _id: '123',
        key: 'test-key',
        provider: 's3',
        bucket: 'test-bucket',
        originalName: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'private',
        namespace: 'default',
        visibilityEnforced: false,
        tags: [],
        ownerUserId: 'user1',
        orgId: 'org1',
        status: 'uploaded',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        storageCheckedBackend: 's3',
      };

      const result = formatAssetResponse(asset);

      expect(result.storageCheckedBackend).toBe('s3');
    });

    test('includes storageExistsError when present', () => {
      const asset = {
        _id: '123',
        key: 'test-key',
        provider: 's3',
        bucket: 'test-bucket',
        originalName: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'private',
        namespace: 'default',
        visibilityEnforced: false,
        tags: [],
        ownerUserId: 'user1',
        orgId: 'org1',
        status: 'uploaded',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        storageExistsError: 'Storage check failed',
      };

      const result = formatAssetResponse(asset);

      expect(result.storageExistsError).toBe('Storage check failed');
    });

    test('handles empty tags array', () => {
      const asset = {
        _id: '123',
        key: 'test-key',
        provider: 's3',
        bucket: 'test-bucket',
        originalName: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'private',
        namespace: 'default',
        visibilityEnforced: false,
        tags: null,
        ownerUserId: 'user1',
        orgId: 'org1',
        status: 'uploaded',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const result = formatAssetResponse(asset);

      expect(result.tags).toEqual([]);
    });
  });

  describe('normalizeTags', () => {
    test('handles array of strings', () => {
      expect(normalizeTags(['tag1', 'tag2', 'tag3'])).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('trims and lowercases tags', () => {
      expect(normalizeTags(['  Tag1  ', 'TAG2', 'Tag3'])).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('removes duplicates', () => {
      expect(normalizeTags(['tag1', 'tag2', 'tag1', 'tag3', 'tag2'])).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('handles comma-separated string', () => {
      expect(normalizeTags('tag1,tag2,tag3')).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('handles comma-separated string with spaces', () => {
      expect(normalizeTags('tag1, tag2, tag3')).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('handles single string', () => {
      expect(normalizeTags('tag1')).toEqual(['tag1']);
    });

    test('handles single string with whitespace', () => {
      expect(normalizeTags('  tag1  ')).toEqual(['tag1']);
    });

    test('handles undefined', () => {
      expect(normalizeTags(undefined)).toBeUndefined();
    });

    test('filters out empty strings', () => {
      expect(normalizeTags(['tag1', '', 'tag2', '  ', 'tag3'])).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('handles numbers', () => {
      expect(normalizeTags([123, 456])).toEqual(['123', '456']);
    });

    test('handles mixed types', () => {
      expect(normalizeTags(['tag1', 123, 'tag2'])).toEqual(['tag1', '123', 'tag2']);
    });

    test('handles empty array', () => {
      expect(normalizeTags([])).toEqual([]);
    });

    test('handles null in array', () => {
      expect(normalizeTags(['tag1', null, 'tag2'])).toEqual(['tag1', 'null', 'tag2']);
    });
  });
});
