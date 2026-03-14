jest.mock('mongoose', () => ({
  connection: {
    db: null
  }
}));

const mongoose = require('mongoose');
const dataCleanupService = require('./dataCleanup.service');

describe('dataCleanup.service', () => {
  describe('toSafeJsonError (exported)', () => {
    test('returns 400 for VALIDATION error code', () => {
      const error = { message: 'Validation failed', code: 'VALIDATION' };
      const result = dataCleanupService.toSafeJsonError(error);
      expect(result).toEqual({ status: 400, body: { error: 'Validation failed' } });
    });

    test('returns 404 for NOT_FOUND error code', () => {
      const error = { message: 'Not found', code: 'NOT_FOUND' };
      const result = dataCleanupService.toSafeJsonError(error);
      expect(result).toEqual({ status: 404, body: { error: 'Not found' } });
    });

    test('returns 403 for FORBIDDEN error code', () => {
      const error = { message: 'Forbidden', code: 'FORBIDDEN' };
      const result = dataCleanupService.toSafeJsonError(error);
      expect(result).toEqual({ status: 403, body: { error: 'Forbidden' } });
    });

    test('returns 500 for unknown error code', () => {
      const error = { message: 'Internal error', code: 'UNKNOWN' };
      const result = dataCleanupService.toSafeJsonError(error);
      expect(result).toEqual({ status: 500, body: { error: 'Internal error' } });
    });

    test('handles error with no message', () => {
      const error = { code: 'VALIDATION' };
      const result = dataCleanupService.toSafeJsonError(error);
      expect(result.body.error).toBe('Operation failed');
    });

    test('handles null error', () => {
      const result = dataCleanupService.toSafeJsonError(null);
      expect(result).toEqual({ status: 500, body: { error: 'Operation failed' } });
    });

    test('handles undefined error', () => {
      const result = dataCleanupService.toSafeJsonError(undefined);
      expect(result).toEqual({ status: 500, body: { error: 'Operation failed' } });
    });
  });

  describe('dryRunCollectionCleanup (requires DB)', () => {
    beforeEach(() => {
      mongoose.connection.db = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ name: 'test_collection' }])
        }),
        command: jest.fn().mockResolvedValue({
          ns: 'testdb.test_collection',
          count: 100,
          size: 50000,
          storageSize: 40000,
          totalIndexSize: 5000,
          avgObjSize: 500
        }),
        collection: jest.fn().mockReturnValue({
          countDocuments: jest.fn().mockResolvedValue(50)
        })
      };
    });

    afterEach(() => {
      mongoose.connection.db = null;
    });

    test('returns dry run result with estimates', async () => {
      const result = await dataCleanupService.dryRunCollectionCleanup({
        collection: 'test_collection',
        olderThanDays: 30,
        dateField: 'createdAt'
      });

      expect(result.collection).toBe('test_collection');
      expect(result.dateField).toBe('createdAt');
      expect(result.olderThanDays).toBe(30);
      expect(result.candidateCount).toBe(50);
      expect(result.estimatedReclaimableBytes).toBe(25000);
      expect(result.collectionStats).toBeDefined();
      expect(result.cutoffIso).toBeDefined();
    });

    test('throws for invalid collection name', async () => {
      await expect(
        dataCleanupService.dryRunCollectionCleanup({
          collection: 'invalid$name',
          olderThanDays: 30
        })
      ).rejects.toThrow();
    });

    test('throws for invalid olderThanDays', async () => {
      await expect(
        dataCleanupService.dryRunCollectionCleanup({
          collection: 'test_collection',
          olderThanDays: -1
        })
      ).rejects.toThrow();
    });

    test('throws for invalid dateField', async () => {
      await expect(
        dataCleanupService.dryRunCollectionCleanup({
          collection: 'test_collection',
          olderThanDays: 30,
          dateField: 'invalid$field'
        })
      ).rejects.toThrow();
    });
  });

  describe('ensureDbConnection (indirect via exported functions)', () => {
    test('throws when db not connected', async () => {
      mongoose.connection.db = null;

      await expect(dataCleanupService.listCollectionStats()).rejects.toThrow('MongoDB connection is not ready');
    });

    test('listCollectionStats returns empty array when no collections', async () => {
      mongoose.connection.db = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([])
        })
      };

      const result = await dataCleanupService.listCollectionStats();
      expect(result).toEqual([]);
    });

    test('listCollectionStats handles collection stats errors gracefully', async () => {
      mongoose.connection.db = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ name: 'test' }])
        }),
        command: jest.fn().mockRejectedValue(new Error('Stats failed'))
      };

      const result = await dataCleanupService.listCollectionStats();
      expect(result).toHaveLength(1);
      expect(result[0].unavailable).toBe(true);
    });
  });

  describe('getMongoGlobalStats', () => {
    test('returns global stats', async () => {
      mongoose.connection.db = {
        stats: jest.fn().mockResolvedValue({
          db: 'testdb',
          collections: 5,
          views: 0,
          objects: 1000,
          dataSize: 500000,
          storageSize: 400000,
          indexes: 10,
          indexSize: 50000,
          totalSize: 450000
        })
      };

      const result = await dataCleanupService.getMongoGlobalStats();

      expect(result.db).toBe('testdb');
      expect(result.collections).toBe(5);
      expect(result.objects).toBe(1000);
      expect(result.dataSizeBytes).toBe(500000);
      expect(result.storageSizeBytes).toBe(400000);
      expect(result.indexes).toBe(10);
      expect(result.indexSizeBytes).toBe(50000);
      expect(result.totalSizeBytes).toBe(450000);
    });

    test('handles null stats gracefully', async () => {
      mongoose.connection.db = {
        stats: jest.fn().mockResolvedValue(null)
      };

      const result = await dataCleanupService.getMongoGlobalStats();

      expect(result.db).toBeNull();
      expect(result.collections).toBe(0);
    });
  });

  describe('inferCollectionFields', () => {
    test('extracts fields from documents', async () => {
      mongoose.connection.db = {
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue([
                { _id: 1, name: 'test', age: 25 },
                { _id: 2, name: 'test2', active: true }
              ])
            })
          })
        })
      };

      const result = await dataCleanupService.inferCollectionFields('test_collection');

      expect(result).toContain('_id');
      expect(result).toContain('name');
      expect(result).toContain('age');
      expect(result).toContain('active');
    });

    test('returns empty array for empty collection', async () => {
      mongoose.connection.db = {
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue([])
            })
          })
        })
      };

      const result = await dataCleanupService.inferCollectionFields('test_collection');

      expect(result).toEqual([]);
    });
  });
});
