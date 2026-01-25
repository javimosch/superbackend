const HeadlessApiToken = require('../models/HeadlessApiToken');
const { 
  generateApiTokenPlaintext, 
  hashToken, 
  timingSafeEqualHex 
} = require('./headlessCrypto.service');
const {
  createApiToken,
  listApiTokens,
  getApiTokenById,
  updateApiToken,
  deleteApiToken,
  authenticateApiToken,
  tokenAllowsOperation
} = require('./headlessApiTokens.service');

jest.mock('../models/HeadlessApiToken');
jest.mock('./headlessCrypto.service');

describe('headlessApiTokens.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createApiToken', () => {
    test('creates a token with valid input', async () => {
      const mockPlaintext = 'token_123';
      const mockHash = 'hash_123';
      generateApiTokenPlaintext.mockReturnValue(mockPlaintext);
      hashToken.mockReturnValue(mockHash);
      
      const mockDoc = {
        name: 'Test Token',
        toObject: jest.fn().mockReturnValue({ name: 'Test Token' })
      };
      HeadlessApiToken.create.mockResolvedValue(mockDoc);

      const result = await createApiToken({ 
        name: 'Test Token', 
        permissions: [{ modelCode: 'User', operations: ['read', 'create'] }] 
      });

      expect(result.token).toBe(mockPlaintext);
      expect(HeadlessApiToken.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test Token',
        tokenHash: mockHash,
        permissions: [{ modelCode: 'User', operations: ['read', 'create'] }]
      }));
    });

    test('throws error if name is missing', async () => {
      await expect(createApiToken({ name: '' })).rejects.toThrow('name is required');
    });

    test('throws error for invalid operation', async () => {
      await expect(createApiToken({ 
        name: 'Test', 
        permissions: [{ modelCode: 'User', operations: ['invalid'] }] 
      })).rejects.toThrow('Invalid operation: invalid');
    });
  });

  describe('authenticateApiToken', () => {
    test('returns token doc if valid token provided', async () => {
      const mockHash = 'hash_123';
      hashToken.mockReturnValue(mockHash);
      
      const mockToken = {
        tokenHash: mockHash,
        save: jest.fn().mockResolvedValue(true),
        toObject: jest.fn().mockReturnValue({ tokenHash: mockHash })
      };
      
      HeadlessApiToken.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([mockToken])
      });
      timingSafeEqualHex.mockReturnValue(true);

      const result = await authenticateApiToken('valid_token');

      expect(result).toBeDefined();
      expect(mockToken.lastUsedAt).toBeDefined();
      expect(mockToken.save).toHaveBeenCalled();
    });

    test('returns null if token does not match', async () => {
      HeadlessApiToken.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });
      const result = await authenticateApiToken('invalid');
      expect(result).toBeNull();
    });

    test('returns null if token is expired', async () => {
      const mockHash = 'hash_123';
      hashToken.mockReturnValue(mockHash);
      
      const mockToken = {
        tokenHash: mockHash,
        expiresAt: new Date(Date.now() - 1000) // 1s ago
      };
      
      HeadlessApiToken.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([mockToken])
      });
      timingSafeEqualHex.mockReturnValue(true);

      const result = await authenticateApiToken('expired');
      expect(result).toBeNull();
    });
  });

  describe('tokenAllowsOperation', () => {
    test('returns true for allowed operation', () => {
      const token = {
        permissions: [{ modelCode: 'User', operations: ['read'] }]
      };
      expect(tokenAllowsOperation(token, 'User', 'read')).toBe(true);
    });

    test('returns false for denied operation', () => {
      const token = {
        permissions: [{ modelCode: 'User', operations: ['read'] }]
      };
      expect(tokenAllowsOperation(token, 'User', 'delete')).toBe(false);
    });

    test('returns false for missing model', () => {
      const token = {
        permissions: [{ modelCode: 'User', operations: ['read'] }]
      };
      expect(tokenAllowsOperation(token, 'Other', 'read')).toBe(false);
    });
  });
});
