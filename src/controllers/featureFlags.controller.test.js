const {
  getEvaluatedFlags,
  getPublicFlags,
} = require('./featureFlags.controller');
const featureFlagsService = require('../services/featureFlags.service');

jest.mock('../services/featureFlags.service', () => ({
  evaluateAllForRequest: jest.fn(),
  flagsArrayToMap: jest.fn(),
}));

describe('featureFlags.controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      user: { _id: 'user123' },
      query: {},
      headers: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('getEvaluatedFlags', () => {
    it('should return evaluated feature flags', async () => {
      mockReq.query = { orgId: 'org456', anonId: 'anon789' };
      const flagsArray = [{ key: 'flag1', enabled: true }];
      const flagsMap = { flag1: { enabled: true } };
      featureFlagsService.evaluateAllForRequest.mockResolvedValue(flagsArray);
      featureFlagsService.flagsArrayToMap.mockReturnValue(flagsMap);

      await getEvaluatedFlags(mockReq, mockRes);

      expect(featureFlagsService.evaluateAllForRequest).toHaveBeenCalledWith({
        userId: 'user123',
        orgId: 'org456',
        anonId: 'anon789',
      });
      expect(featureFlagsService.flagsArrayToMap).toHaveBeenCalledWith(flagsArray);
      expect(mockRes.json).toHaveBeenCalledWith({ flags: flagsMap });
    });

    it('should fall back to headers when query params are missing', async () => {
      mockReq.headers = { 'x-org-id': 'orgFromHeader', 'x-anon-id': 'anonFromHeader' };
      featureFlagsService.evaluateAllForRequest.mockResolvedValue([]);
      featureFlagsService.flagsArrayToMap.mockReturnValue({});

      await getEvaluatedFlags(mockReq, mockRes);

      expect(featureFlagsService.evaluateAllForRequest).toHaveBeenCalledWith({
        userId: 'user123',
        orgId: 'orgFromHeader',
        anonId: 'anonFromHeader',
      });
    });

    it('should pass null when user, orgId, and anonId are all missing', async () => {
      delete mockReq.user;
      featureFlagsService.evaluateAllForRequest.mockResolvedValue([]);
      featureFlagsService.flagsArrayToMap.mockReturnValue({});

      await getEvaluatedFlags(mockReq, mockRes);

      expect(featureFlagsService.evaluateAllForRequest).toHaveBeenCalledWith({
        userId: undefined,
        orgId: null,
        anonId: null,
      });
    });

    it('should handle errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      featureFlagsService.evaluateAllForRequest.mockRejectedValue(new Error('DB error'));

      await getEvaluatedFlags(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to evaluate feature flags' });
      consoleSpy.mockRestore();
    });
  });

  describe('getPublicFlags', () => {
    it('should return public feature flags without userId', async () => {
      mockReq.query = { orgId: 'org456', anonId: 'anon789' };
      const flagsArray = [{ key: 'flag1', enabled: true }];
      const flagsMap = { flag1: { enabled: true } };
      featureFlagsService.evaluateAllForRequest.mockResolvedValue(flagsArray);
      featureFlagsService.flagsArrayToMap.mockReturnValue(flagsMap);

      await getPublicFlags(mockReq, mockRes);

      expect(featureFlagsService.evaluateAllForRequest).toHaveBeenCalledWith({
        userId: null,
        orgId: 'org456',
        anonId: 'anon789',
      });
      expect(mockRes.json).toHaveBeenCalledWith({ flags: flagsMap });
    });

    it('should ignore req.user', async () => {
      featureFlagsService.evaluateAllForRequest.mockResolvedValue([]);
      featureFlagsService.flagsArrayToMap.mockReturnValue({});

      await getPublicFlags(mockReq, mockRes);

      expect(featureFlagsService.evaluateAllForRequest).toHaveBeenCalledWith({
        userId: null,
        orgId: null,
        anonId: null,
      });
    });

    it('should handle errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      featureFlagsService.evaluateAllForRequest.mockRejectedValue(new Error('DB error'));

      await getPublicFlags(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to evaluate feature flags' });
      consoleSpy.mockRestore();
    });
  });
});
