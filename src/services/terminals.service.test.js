const EventEmitter = require('events');
const terminalsService = require('./terminals.service');

function makeMockBackend(overrides = {}) {
  return {
    backendType: 'mock',
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
    onData: jest.fn(),
    onExit: jest.fn(),
    ...overrides,
  };
}

function makeFakeProc() {
  const proc = Object.assign(new EventEmitter(), {
    pid: 12345,
    stdin: { write: jest.fn() },
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: jest.fn(),
  });
  return proc;
}

function clearAllSessions() {
  for (const s of terminalsService.listSessions()) {
    try { terminalsService.killSession(s.sessionId); } catch (e) { console.error('[terminals.test] Failed to kill session:', e?.message || e); }
  }
}

describe('terminals.service', () => {
  describe('_detectBackendType', () => {
    test('returns a valid backend type string', () => {
      const type = terminalsService._detectBackendType();
      expect(['node-pty', 'basic-spawn']).toContain(type);
    });
  });

  describe('createSession (mocked backend)', () => {
    let mockBackend;

    beforeEach(() => {
      mockBackend = makeMockBackend();
      jest.spyOn(terminalsService, '_createBackend').mockReturnValue(mockBackend);
      clearAllSessions();
    });

    afterEach(() => {
      jest.restoreAllMocks();
      clearAllSessions();
    });

    test('creates a session and returns a sessionId', () => {
      const result = terminalsService.createSession({ cols: 80, rows: 24 });
      expect(result.sessionId).toBeDefined();
      expect(terminalsService._createBackend).toHaveBeenCalledWith(
        expect.any(String), 80, 24
      );
    });

    test('throws error when too many sessions', () => {
      const currentCount = terminalsService.listSessions().length;
      const createdIds = [];
      for (let i = currentCount; i < 20; i++) {
        createdIds.push(terminalsService.createSession().sessionId);
      }
      expect(() => terminalsService.createSession()).toThrow('Too many active terminal sessions');
      for (const id of createdIds) {
        terminalsService.killSession(id);
      }
    });

    test('registers onExit callback on backend', () => {
      terminalsService.createSession();
      expect(mockBackend.onExit).toHaveBeenCalledWith(expect.any(Function));
    });

    test('session backendType reflects mock backend', () => {
      mockBackend.backendType = 'node-pty';
      const { sessionId } = terminalsService.createSession();
      expect(terminalsService.getSession(sessionId).backendType).toBe('node-pty');
    });
  });

  describe('session operations (mocked backend)', () => {
    let mockBackend;
    let sessionId;

    beforeEach(() => {
      mockBackend = makeMockBackend();
      jest.spyOn(terminalsService, '_createBackend').mockReturnValue(mockBackend);
      clearAllSessions();
      sessionId = terminalsService.createSession().sessionId;
    });

    afterEach(() => {
      jest.restoreAllMocks();
      if (sessionId) {
        try { terminalsService.killSession(sessionId); } catch (e) { console.error('[terminals.test] Failed to kill session:', e?.message || e); }
      }
    });

    test('listSessions returns active sessions including backendType', () => {
      const list = terminalsService.listSessions();
      const found = list.find(s => s.sessionId === sessionId);
      expect(found).toBeDefined();
      expect(found).toHaveProperty('backendType');
    });

    test('getSession returns correct session with backend and pty alias', () => {
      const session = terminalsService.getSession(sessionId);
      expect(session.sessionId).toBe(sessionId);
      expect(session.backend).toBe(mockBackend);
      expect(session.pty).toBe(mockBackend);
    });

    test('writeSession delegates to backend.write', () => {
      terminalsService.writeSession(sessionId, 'ls\n');
      expect(mockBackend.write).toHaveBeenCalledWith('ls\n');
    });

    test('resizeSession delegates to backend.resize', () => {
      terminalsService.resizeSession(sessionId, 100, 40);
      expect(mockBackend.resize).toHaveBeenCalledWith(100, 40);
    });

    test('killSession calls backend.kill and removes session', () => {
      const result = terminalsService.killSession(sessionId);
      expect(result.ok).toBe(true);
      expect(mockBackend.kill).toHaveBeenCalled();
      expect(terminalsService.getSession(sessionId)).toBeNull();
      sessionId = null;
    });

    test('onExit callback marks session as closed', () => {
      let exitCb;
      mockBackend.onExit = jest.fn((cb) => { exitCb = cb; });
      jest.restoreAllMocks();
      jest.spyOn(terminalsService, '_createBackend').mockReturnValue(mockBackend);

      const { sessionId: id } = terminalsService.createSession();
      expect(exitCb).toBeDefined();
      exitCb({ exitCode: 0 });
      expect(terminalsService.getSession(id).status).toBe('closed');
      terminalsService.killSession(id);
    });
  });

  describe('BasicSpawnBackend (mocked child_process)', () => {
    let spawnSpy;
    let fakeProc;
    const cp = require('child_process');

    beforeEach(() => {
      fakeProc = makeFakeProc();
      spawnSpy = jest.spyOn(cp, 'spawn').mockReturnValue(fakeProc);
    });

    afterEach(() => {
      spawnSpy.mockRestore();
    });

    test('backendType is basic-spawn', () => {
      const backend = terminalsService._createBackend('bash', 80, 24, 'basic-spawn');
      expect(backend.backendType).toBe('basic-spawn');
    });

    test('resize is a no-op', () => {
      const backend = terminalsService._createBackend('bash', 80, 24, 'basic-spawn');
      expect(() => backend.resize(100, 40)).not.toThrow();
    });

    test('write delegates to stdin', () => {
      const backend = terminalsService._createBackend('bash', 80, 24, 'basic-spawn');
      backend.write('hello');
      expect(fakeProc.stdin.write).toHaveBeenCalledWith('hello');
    });

    test('onData receives stdout chunks', () => {
      const backend = terminalsService._createBackend('bash', 80, 24, 'basic-spawn');
      const received = [];
      backend.onData((d) => received.push(d));
      fakeProc.stdout.emit('data', Buffer.from('hello'));
      expect(received).toEqual(['hello']);
    });

    test('onExit fires when process exits', () => {
      const backend = terminalsService._createBackend('bash', 80, 24, 'basic-spawn');
      const onExitCb = jest.fn();
      backend.onExit(onExitCb);
      fakeProc.emit('exit', 0);
      expect(onExitCb).toHaveBeenCalledWith({ exitCode: 0 });
    });
  });
});
