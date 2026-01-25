jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('abcd1234')
  }),
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('random-hex')
  })
}));
jest.mock('../models/GlobalSetting', () => ({
  find: jest.fn()
}));

const crypto = require('crypto');
const GlobalSetting = require('../models/GlobalSetting');
const featureFlagsService = require('./featureFlags.service');

const {
  FEATURE_FLAG_PREFIX,
  stripPrefix,
  loadAllDefinitions,
  evaluateAllForRequest,
  flagsArrayToMap,
  createFeatureFlagsEjsMiddleware
} = featureFlagsService;

describe('featureFlags.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('stripPrefix', () => {
    test('removes FEATURE_FLAG. prefix', () => {
      expect(stripPrefix('FEATURE_FLAG.test')).toBe('test');
      expect(stripPrefix('FEATURE_FLAG.')).toBe('');
      expect(stripPrefix('test')).toBe('test');
      expect(stripPrefix('')).toBe('');
      expect(stripPrefix(null)).toBe(null);
    });
  });

  describe('loadAllDefinitions', () => {
    test('loads and normalizes definitions from settings', async () => {
      const mockSettings = [
        {
          key: 'FEATURE_FLAG.test1',
          value: JSON.stringify({ enabled: true, description: 'Test 1' }),
          description: 'Fallback desc'
        },
        {
          key: 'FEATURE_FLAG.test2',
          value: 'invalid-json',
          description: 'Test 2'
        }
      ];

      GlobalSetting.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockSettings)
        })
      });

      const definitions = await loadAllDefinitions();

      expect(definitions).toHaveLength(2);
      expect(definitions[0]).toMatchObject({
        key: 'test1',
        enabled: true,
        description: 'Test 1'
      });
      expect(definitions[1]).toMatchObject({
        key: 'test2',
        enabled: false,
        description: 'Test 2'
      });
    });
  });

  describe('evaluateAllForRequest', () => {
    test('evaluates all flags for request', async () => {
      const mockDefs = [
        { key: 'test1', enabled: true },
        { key: 'test2', enabled: false }
      ];

      jest.spyOn(featureFlagsService, 'loadAllDefinitions').mockResolvedValue(mockDefs);

      const results = await evaluateAllForRequest({ userId: 'user1' });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ key: 'test1', enabled: true });
      expect(results[1]).toMatchObject({ key: 'test2', enabled: false });
    });

    test('evaluates multiple flags correctly', async () => {
      const mockSettings = [
        {
          key: 'FEATURE_FLAG.test1',
          type: 'json',
          value: JSON.stringify({ enabled: true, payload: { color: 'blue' } })
        },
        {
          key: 'FEATURE_FLAG.test2',
          type: 'json',
          value: JSON.stringify({ enabled: false, rolloutPercentage: 100 })
        }
      ];
      GlobalSetting.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSettings)
      });

      const result = await featureFlagsService.evaluateAllForRequest({ userId: 'u1' });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ key: 'test1', enabled: true, payload: { color: 'blue' } });
      expect(result[1].enabled).toBe(true); // 100% rollout
    });

    test('respects deny lists', async () => {
      const mockSettings = [{
        key: 'FEATURE_FLAG.denied',
        type: 'json',
        value: JSON.stringify({ enabled: true, denyListUserIds: ['u1'] })
      }];
      GlobalSetting.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSettings)
      });

      const result = await featureFlagsService.evaluateAllForRequest({ userId: 'u1' });
      expect(result[0].enabled).toBe(false);
    });

    test('respects allow lists over global enabled state', async () => {
      const mockSettings = [{
        key: 'FEATURE_FLAG.allowed',
        type: 'json',
        value: JSON.stringify({ enabled: false, allowListUserIds: ['u1'] })
      }];
      GlobalSetting.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSettings)
      });

      const result = await featureFlagsService.evaluateAllForRequest({ userId: 'u1' });
      expect(result[0].enabled).toBe(true);
    });
  });

  describe('flagsArrayToMap', () => {
    test('converts array to map', () => {
      const flags = [
        { key: 'flag1', enabled: true, payload: { data: 'test' } },
        { key: 'flag2', enabled: false },
        null,
        { key: 'flag3', enabled: true }
      ];

      const map = flagsArrayToMap(flags);

      expect(map).toEqual({
        flag1: { enabled: true, payload: { data: 'test' } },
        flag2: { enabled: false },
        flag3: { enabled: true }
      });
    });
  });

  describe('createFeatureFlagsEjsMiddleware', () => {
    test('skips when disabled', () => {
      const middleware = createFeatureFlagsEjsMiddleware({ enabled: false });
      const next = jest.fn();

      middleware({}, {}, next);
      expect(next).toHaveBeenCalled();
    });

    test('processes HTML requests', async () => {
      const middleware = createFeatureFlagsEjsMiddleware();
      const req = {
        headers: { accept: 'text/html' },
        query: { orgId: 'org123' },
        headers: { cookie: 'saas_anon_id=anon123' }
      };
      const res = { locals: {}, setHeader: jest.fn() };
      const next = jest.fn();

      GlobalSetting.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      await middleware(req, res, next);

      expect(res.locals.featureFlags).toBeDefined();
      expect(res.locals.ff).toBeDefined();
      expect(res.locals.ffPayload).toBeDefined();
      expect(next).toHaveBeenCalled();
    });
  });
});
