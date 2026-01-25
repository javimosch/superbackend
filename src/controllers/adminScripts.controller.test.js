const controller = require('./adminScripts.controller');
const ScriptDefinition = require('../models/ScriptDefinition');
const ScriptRun = require('../models/ScriptRun');
const scriptsRunner = require('../services/scriptsRunner.service');
const auditLogger = require('../services/auditLogger');

jest.mock('../models/ScriptDefinition');
jest.mock('../models/ScriptRun');
jest.mock('../services/scriptsRunner.service');
jest.mock('../services/auditLogger', () => ({
  logAuditSync: jest.fn()
}));
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'admin', actorId: 'test' })),
}));

describe('adminScripts.controller', () => {
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

  describe('listScripts', () => {
    test('returns all script definitions', async () => {
      const mockItems = [{ name: 's1' }];
      ScriptDefinition.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockItems)
      });

      await controller.listScripts(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
    });
  });

  describe('createScript', () => {
    test('creates a new script successfully', async () => {
      mockReq.body = { name: 'New Script', type: 'node', runner: 'vm2', script: 'console.log(1)' };
      const mockDoc = { 
        ...mockReq.body, 
        _id: 's1', 
        toObject: () => ({ ...mockReq.body, _id: 's1' }) 
      };
      ScriptDefinition.create.mockResolvedValue(mockDoc);

      await controller.createScript(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(auditLogger.logAuditSync).toHaveBeenCalledWith(expect.objectContaining({ action: 'scripts.create' }));
    });
  });

  describe('runScript', () => {
    test('starts a script run successfully', async () => {
      mockReq.params.id = 's1';
      const mockScript = { _id: 's1', enabled: true, toObject: () => ({ _id: 's1' }) };
      ScriptDefinition.findById.mockResolvedValue(mockScript);
      
      const mockRun = { _id: 'run1' };
      scriptsRunner.startRun.mockResolvedValue(mockRun);

      await controller.runScript(mockReq, mockRes);

      expect(scriptsRunner.startRun).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ runId: 'run1' });
    });

    test('returns 400 if script is disabled', async () => {
      mockReq.params.id = 's1';
      ScriptDefinition.findById.mockResolvedValue({ _id: 's1', enabled: false });

      await controller.runScript(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Script is disabled' });
    });
  });

  describe('updateScript', () => {
    test('updates script definition successfully', async () => {
      mockReq.params.id = 's1';
      mockReq.body = { name: 'Updated Name', script: 'console.log(2)' };
      
      const mockDoc = {
        _id: 's1',
        name: 'Old Name',
        script: 'console.log(1)',
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };
      ScriptDefinition.findById.mockResolvedValue(mockDoc);

      await controller.updateScript(mockReq, mockRes);

      expect(mockDoc.name).toBe('Updated Name');
      expect(mockDoc.script).toBe('console.log(2)');
      expect(mockDoc.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('returns 404 if script not found', async () => {
      mockReq.params.id = 'missing';
      ScriptDefinition.findById.mockResolvedValue(null);
      await controller.updateScript(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteScript', () => {
    test('removes script definition successfully', async () => {
      mockReq.params.id = 's1';
      const mockDoc = {
        _id: 's1',
        deleteOne: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 's1' })
      };
      ScriptDefinition.findById.mockResolvedValue(mockDoc);

      await controller.deleteScript(mockReq, mockRes);

      expect(mockDoc.deleteOne).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe('listRuns', () => {
    test('returns paginated script runs', async () => {
      mockReq.query = { scriptId: 's1' };
      const mockItems = [{ _id: 'run1', status: 'succeeded' }];
      ScriptRun.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockItems)
      });

      await controller.listRuns(mockReq, mockRes);

      expect(ScriptRun.find).toHaveBeenCalledWith({ scriptId: 's1' });
      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
    });
  });

  describe('getRun', () => {
    test('returns run details', async () => {
      mockReq.params.runId = 'run1';
      const mockRun = { _id: 'run1', status: 'succeeded' };
      ScriptRun.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockRun) });

      await controller.getRun(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: mockRun });
    });
  });
});
