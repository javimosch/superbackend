const { EventEmitter } = require('events');
const ScriptRun = require('../models/ScriptRun');
const scriptsRunner = require('./scriptsRunner.service');

jest.mock('../models/ScriptRun', () => ({
  create: jest.fn(),
  updateOne: jest.fn()
}));

// Mock child_process and vm2 to avoid Babel transformation issues or actual execution
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('vm2', () => ({
  NodeVM: jest.fn()
}));

describe('scriptsRunner.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('safeJsonParse', () => {
    test('parses valid JSON', () => {
      expect(scriptsRunner.safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    });

    test('returns null for invalid JSON', () => {
      expect(scriptsRunner.safeJsonParse('{invalid')).toBeNull();
      expect(scriptsRunner.safeJsonParse(null)).toBeNull();
    });
  });

  describe('startRun', () => {
    test('creates a script run document', async () => {
      const mockScriptDef = {
        _id: 'script123',
        type: 'bash',
        runner: 'host',
        script: 'echo hello'
      };
      
      const mockRunDoc = {
        _id: 'run123',
        status: 'queued'
      };
      
      ScriptRun.create.mockResolvedValue(mockRunDoc);

      const result = await scriptsRunner.startRun(mockScriptDef);

      expect(ScriptRun.create).toHaveBeenCalledWith(expect.objectContaining({
        scriptId: 'script123',
        status: 'queued'
      }));
      expect(result._id).toBe('run123');
    });
  });

  describe('getRunBus', () => {
    test('returns null for nonexistent run', () => {
      expect(scriptsRunner.getRunBus('missing')).toBeNull();
    });
  });
});
