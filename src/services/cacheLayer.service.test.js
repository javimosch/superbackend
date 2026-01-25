jest.mock('../models/CacheEntry', () => ({
  findOne: jest.fn(),
  deleteOne: jest.fn(),
  deleteMany: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  find: jest.fn()
}));
jest.mock('./globalSettings.service', () => ({
  getSettingValue: jest.fn()
}));

const CacheEntry = require('../models/CacheEntry');
const { getSettingValue } = require('./globalSettings.service');
const cacheLayerService = require('./cacheLayer.service');

// These utility functions are not exported, so we'll skip testing them directly
// and focus on the service methods that use them

describe('CacheLayerService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = cacheLayerService;
    // Reset config cache
    service._configCache = { value: null, ts: 0 };
    // Clear environment variables
    delete process.env.CACHE_LAYER_BACKEND;
    delete process.env.CACHE_LAYER_REDIS_URL;
    delete process.env.CACHE_LAYER_REDIS_PREFIX;
    delete process.env.CACHE_LAYER_OFFLOAD_THRESHOLD_BYTES;
    delete process.env.CACHE_LAYER_MAX_ENTRY_BYTES;
    delete process.env.CACHE_LAYER_DEFAULT_TTL_SECONDS;
    delete process.env.CACHE_LAYER_EVICTION_POLICY;
    delete process.env.CACHE_LAYER_AT_REST_FORMAT;
    // Mock CacheEntry methods
    CacheEntry.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    CacheEntry.deleteOne.mockResolvedValue({ deletedCount: 0 });
    CacheEntry.updateOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
    CacheEntry.deleteMany.mockResolvedValue({ deletedCount: 0 });
    CacheEntry.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    });
    CacheEntry.countDocuments.mockResolvedValue(0);
    CacheEntry.aggregate.mockResolvedValue([]);
  });

  describe('getConfig', () => {
    test('caches config for 2 seconds', async () => {
      getSettingValue.mockResolvedValue('memory');
      jest.useFakeTimers();
      
      const config1 = await service.getConfig();
      
      // Advance time by less than cache TTL
      jest.advanceTimersByTime(1000);
      
      const config2 = await service.getConfig();
      
      expect(getSettingValue).toHaveBeenCalledTimes(8); // Called for each config setting
      expect(config1).toBe(config2);
      
      jest.useRealTimers();
    });

    test('loads config from environment and settings', async () => {
      process.env.CACHE_LAYER_BACKEND = 'redis';
      process.env.CACHE_LAYER_EVICTION_POLICY = 'fifo';
      getSettingValue.mockResolvedValue('fallback');

      const config = await service.getConfig();

      expect(config.backend).toBe('redis');
      expect(config.evictionPolicy).toBe('fifo');
    });

    test('uses default values when not configured', async () => {
      getSettingValue.mockResolvedValue(null);

      const config = await service.getConfig();

      expect(config.backend).toBe('memory');
      expect(config.evictionPolicy).toBe('lru');
      expect(config.defaultTtlSeconds).toBe(600);
      expect(config.maxEntryBytes).toBe(262144);
    });
  });

  describe('set/get/delete operations', () => {
    test('sets and gets values in memory', async () => {
      await service.set('test', 'value', { namespace: 'ns1' });
      
      const result = await service.get('test', { namespace: 'ns1' });
      
      expect(result).toBe('value');
    });

    test('respects TTL', async () => {
      jest.useFakeTimers();
      
      await service.set('test', 'value', { ttlSeconds: 1 });
      
      jest.advanceTimersByTime(1100);
      
      const result = await service.get('test');
      
      expect(result).toBeNull();
      
      jest.useRealTimers();
    });

    test('deletes values', async () => {
      await service.set('test', 'value');
      
      const deleteResult = await service.delete('test');
      const getResult = await service.get('test');
      
      expect(deleteResult.ok).toBe(true);
      expect(getResult).toBeNull();
    });

    test('validates max entry size', async () => {
      getSettingValue.mockResolvedValue('memory');
      
      const largeValue = 'x'.repeat(300000);
      
      await expect(service.set('large', largeValue)).rejects.toThrow('Value exceeds max entry size');
    });
  });

  describe('clear operations', () => {
    test('clears all memory entries', async () => {
      await service.set('key1', 'value1');
      await service.set('key2', 'value2');
      
      const result = await service.clear();
      
      expect(result.ok).toBe(true);
      expect(result.cleared.memory).toBeGreaterThanOrEqual(2);
      
      const get1 = await service.get('key1');
      const get2 = await service.get('key2');
      
      expect(get1).toBeNull();
      expect(get2).toBeNull();
    });

    test('clears by namespace', async () => {
      await service.set('key1', 'value1', { namespace: 'ns1' });
      await service.set('key2', 'value2', { namespace: 'ns2' });
      
      const result = await service.clear({ namespace: 'ns1' });
      
      expect(result.ok).toBe(true);
      expect(result.cleared.memory).toBe(1);
      
      const get1 = await service.get('key1', { namespace: 'ns1' });
      const get2 = await service.get('key2', { namespace: 'ns2' });
      
      expect(get1).toBeNull();
      expect(get2).toBe('value2');
    });
  });

  describe('listKeys', () => {
    test('lists keys from memory', async () => {
      await service.set('key1', 'value1', { namespace: 'ns1' });
      await service.set('key2', 'value2', { namespace: 'ns2' });
      
      const result = await service.listKeys();
      
      expect(result.memory).toHaveLength(2);
      expect(result.memory[0]).toMatchObject({
        namespace: 'ns1',
        key: 'key1',
        backend: 'memory'
      });
    });

    test('filters by namespace and prefix', async () => {
      await service.set('key1', 'value1', { namespace: 'ns1' });
      await service.set('key2', 'value2', { namespace: 'ns1' });
      await service.set('other', 'value', { namespace: 'ns2' });
      
      const result = await service.listKeys({ 
        namespace: 'ns1', 
        prefix: 'key' 
      });
      
      expect(result.memory).toHaveLength(2);
      expect(result.memory.every(k => k.namespace === 'ns1')).toBe(true);
      expect(result.memory.every(k => k.key.startsWith('key'))).toBe(true);
    });
  });
});
