const controller = require('./adminDbBrowser.controller');
const dbBrowser = require('../services/dbBrowser.service');

jest.mock('../services/dbBrowser.service');

describe('adminDbBrowser.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('listConnections', () => {
    test('returns all connections', async () => {
      const mockItems = [{ _id: 'conn1', name: 'Local Mongo' }];
      dbBrowser.listConnections.mockResolvedValue(mockItems);

      await controller.listConnections(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
    });
  });

  describe('createConnection', () => {
    test('creates new connection successfully', async () => {
      mockReq.body = { name: 'Prod', uri: 'mongodb://...' };
      const mockItem = { _id: 'c1', ...mockReq.body };
      dbBrowser.createConnection.mockResolvedValue(mockItem);

      await controller.createConnection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });

    test('returns 400 for duplicate name', async () => {
      mockReq.body = { name: 'duplicate' };
      const error = new Error('duplicate');
      error.code = 11000;
      dbBrowser.createConnection.mockRejectedValue(error);

      await controller.createConnection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Connection name must be unique' });
    });
  });

  describe('listDatabases', () => {
    test('returns list of databases for connection', async () => {
      mockReq.params.id = 'conn1';
      const mockDbs = ['db1', 'db2'];
      dbBrowser.listDatabases.mockResolvedValue(mockDbs);

      await controller.listDatabases(mockReq, mockRes);

      expect(dbBrowser.listDatabases).toHaveBeenCalledWith('conn1');
      expect(mockRes.json).toHaveBeenCalledWith({ items: mockDbs });
    });
  });

  describe('listRecords', () => {
    test('returns paginated records', async () => {
      mockReq.params = { id: 'c1', database: 'db1', namespace: 'ns1' };
      mockReq.query = { page: '1', pageSize: '20' };
      const mockResult = { items: [{}], total: 1 };
      dbBrowser.listRecords.mockResolvedValue(mockResult);

      await controller.listRecords(mockReq, mockRes);

      expect(dbBrowser.listRecords).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });
  });
});
