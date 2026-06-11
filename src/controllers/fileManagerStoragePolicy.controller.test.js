const {
  getStoragePolicy,
} = require('./fileManagerStoragePolicy.controller');
const fileManagerStoragePolicyService = require('../services/fileManagerStoragePolicy.service');

jest.mock('../services/fileManagerStoragePolicy.service', () => ({
  getEffectivePolicy: jest.fn(),
}));

describe('fileManagerStoragePolicy.controller', () => {
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

  describe('getStoragePolicy', () => {
    it('should return effective storage policy', async () => {
      mockReq.query = {
        orgId: 'org456',
        driveType: 'user',
        driveId: 'drive789',
      };
      const payload = {
        effective: { maxUploadBytes: 1000, maxStorageBytes: 5000 },
        usage: { usedBytes: 100, overageBytes: 0 },
      };
      fileManagerStoragePolicyService.getEffectivePolicy.mockResolvedValue(payload);

      await getStoragePolicy(mockReq, mockRes);

      expect(fileManagerStoragePolicyService.getEffectivePolicy).toHaveBeenCalledWith({
        userId: 'user123',
        orgId: 'org456',
        driveType: 'user',
        driveId: 'drive789',
      });
      expect(mockRes.json).toHaveBeenCalledWith(payload);
    });

    it('should fall back to x-org-id header when orgId query param is missing', async () => {
      mockReq.query = { driveType: 'group', driveId: 'drive789' };
      mockReq.headers['x-org-id'] = 'orgFromHeader';
      fileManagerStoragePolicyService.getEffectivePolicy.mockResolvedValue({});

      await getStoragePolicy(mockReq, mockRes);

      expect(fileManagerStoragePolicyService.getEffectivePolicy).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'orgFromHeader' })
      );
    });

    it('should pass null when orgId is missing', async () => {
      mockReq.query = { driveType: 'org', driveId: 'drive789' };
      fileManagerStoragePolicyService.getEffectivePolicy.mockResolvedValue({});

      await getStoragePolicy(mockReq, mockRes);

      expect(fileManagerStoragePolicyService.getEffectivePolicy).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: null })
      );
    });

    it('should handle VALIDATION error with 400', async () => {
      fileManagerStoragePolicyService.getEffectivePolicy.mockRejectedValue(
        Object.assign(new Error('driveType must be one of: user, group, org'), { code: 'VALIDATION' })
      );

      await getStoragePolicy(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'driveType must be one of: user, group, org',
      });
    });

    it('should handle generic errors with 500', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      fileManagerStoragePolicyService.getEffectivePolicy.mockRejectedValue(new Error('DB error'));

      await getStoragePolicy(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to get storage policy' });
      consoleSpy.mockRestore();
    });
  });
});
