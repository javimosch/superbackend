const ExternalDbConnection = require('../models/ExternalDbConnection');
const dbBrowserService = require('./dbBrowser.service');
const { encryptString, decryptString } = require('../utils/encryption');

jest.mock('../models/ExternalDbConnection');
jest.mock('../utils/encryption');

describe('dbBrowser.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('toSafeJsonError', () => {
    test('maps validation errors to 400', () => {
      const err = new Error('Invalid');
      err.code = 'VALIDATION';
      const result = dbBrowserService.toSafeJsonError(err);
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('Invalid');
    });

    test('maps not found errors to 404', () => {
      const err = new Error('Missing');
      err.code = 'NOT_FOUND';
      const result = dbBrowserService.toSafeJsonError(err);
      expect(result.status).toBe(404);
    });

    test('defaults to 500', () => {
      const result = dbBrowserService.toSafeJsonError(new Error('Boom'));
      expect(result.status).toBe(500);
    });
  });

  describe('connection CRUD', () => {
    test('listConnections returns sanitized docs', async () => {
      const mockDocs = [
        { _id: '1', name: 'DB 1', type: 'mongo', enabled: true, createdAt: new Date() }
      ];
      ExternalDbConnection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockDocs)
      });

      const result = await dbBrowserService.listConnections();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].uriEncrypted).toBeUndefined();
    });

    test('createConnection encrypts URI and saves', async () => {
      const payload = { name: 'Test', type: 'mongo', uri: 'mongodb://user:pass@host' };
      encryptString.mockReturnValue('encrypted-uri');
      ExternalDbConnection.create.mockResolvedValue({
        _id: 'new-id',
        ...payload,
        uriEncrypted: 'encrypted-uri',
        uriMasked: 'mongodb://***:***@host/'
      });

      const result = await dbBrowserService.createConnection(payload);
      expect(encryptString).toHaveBeenCalledWith(payload.uri);
      expect(result.id).toBe('new-id');
    });
  });

  describe('testConnection', () => {
    test('throws if connection not found', async () => {
      ExternalDbConnection.findById.mockResolvedValue(null);
      await expect(dbBrowserService.testConnection('missing')).rejects.toThrow('Connection not found');
    });

    test('throws if connection disabled', async () => {
      ExternalDbConnection.findById.mockResolvedValue({ _id: '1', enabled: false });
      await expect(dbBrowserService.testConnection('1')).rejects.toThrow('Connection is disabled');
    });
  });
});
