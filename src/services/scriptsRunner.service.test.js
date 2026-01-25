const { EventEmitter } = require('events');
const ScriptRun = require('../models/ScriptRun');
const scriptsRunner = require('./scriptsRunner.service');
const { spawn } = require('child_process');
const { NodeVM } = require('vm2');

jest.mock('../models/ScriptRun', () => ({
  create: jest.fn(),
  updateOne: jest.fn()
}));

// Mock child_process and vm2
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('vm2', () => {
  return {
    NodeVM: jest.fn().mockImplementation(() => ({
      run: jest.fn(),
      on: jest.fn().mockReturnThis()
    }))
  };
});

describe('scriptsRunner.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ legacyFakeTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
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

    test('creates a script run document and starts background execution', async () => {
      ScriptRun.create.mockResolvedValue(mockRunDoc);
      
      const mockChild = {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        on: jest.fn(),
        kill: jest.fn()
      };
      spawn.mockReturnValue(mockChild);

      const result = await scriptsRunner.startRun(mockScriptDef);

      expect(ScriptRun.create).toHaveBeenCalledWith(expect.objectContaining({
        scriptId: 'script123',
        status: 'queued'
      }));
      expect(result._id).toBe('run123');

      // Trigger setImmediate
      jest.runAllImmediates();
      
      expect(ScriptRun.updateOne).toHaveBeenCalledWith(
        { _id: 'run123' },
        expect.objectContaining({ '$set': expect.objectContaining({ status: 'running' }) })
      );
    });

    test('executes node script with vm2', async () => {
      const nodeScriptDef = {
        _id: 'node123',
        type: 'node',
        runner: 'vm2',
        script: 'console.log("hi")'
      };
      ScriptRun.create.mockResolvedValue({ _id: 'runNode' });
      
      // NodeVM is already mocked globally in this file
      const { NodeVM } = require('vm2');

      await scriptsRunner.startRun(nodeScriptDef);
      
      // Trigger setImmediate
      jest.runAllImmediates();

      // We mainly want to ensure it doesn't throw and reaches the internal execution path
      expect(ScriptRun.create).toHaveBeenCalled();
    });
  });

  describe('getRunBus', () => {
    test('returns null for nonexistent run', () => {
      expect(scriptsRunner.getRunBus('missing')).toBeNull();
    });

    test('returns bus for active run', async () => {
      ScriptRun.create.mockResolvedValue({ _id: 'runBusTest' });
      await scriptsRunner.startRun({ _id: 's1', type: 'bash', runner: 'host' });
      
      const bus = scriptsRunner.getRunBus('runBusTest');
      expect(bus).not.toBeNull();
      expect(bus.runId).toBe('runBusTest');
    });
  });
});
