const crypto = require('crypto');
const pty = require('node-pty');
const terminalsService = require('./terminals.service');

jest.mock('node-pty');

describe('terminals.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Access private sessions map to clear it between tests if needed, 
    // or just rely on the fact that sessions are tracked by ID.
    // For now, we'll try to keep it simple.
  });

  describe('createSession', () => {
    test('creates a new pty session', () => {
      const mockPty = {
        onExit: jest.fn(),
        resize: jest.fn(),
        write: jest.fn(),
        kill: jest.fn()
      };
      pty.spawn.mockReturnValue(mockPty);

      const result = terminalsService.createSession({ cols: 80, rows: 24 });

      expect(result.sessionId).toBeDefined();
      expect(pty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({
          cols: 80,
          rows: 24
        })
      );
      // Cleanup for other tests
      terminalsService.killSession(result.sessionId);
    });

    test('throws error when too many sessions', () => {
      const mockPty = { onExit: jest.fn(), kill: jest.fn() };
      pty.spawn.mockReturnValue(mockPty);

      const createdIds = [];
      // Fill up to MAX_SESSIONS
      const currentCount = terminalsService.listSessions().length;
      for (let i = currentCount; i < 20; i++) {
        const res = terminalsService.createSession();
        createdIds.push(res.sessionId);
      }

      expect(() => terminalsService.createSession()).toThrow('Too many active terminal sessions');

      // Cleanup
      for (const id of createdIds) {
        terminalsService.killSession(id);
      }
    });
  });

  describe('session operations', () => {
    let sessionId;
    const mockPty = {
      onExit: jest.fn(),
      resize: jest.fn(),
      write: jest.fn(),
      kill: jest.fn()
    };

    beforeEach(() => {
      pty.spawn.mockReturnValue(mockPty);
      // Ensure we have room for a new session
      const list = terminalsService.listSessions();
      for (const s of list) {
        try { terminalsService.killSession(s.sessionId); } catch (e) {}
      }
      const res = terminalsService.createSession();
      sessionId = res.sessionId;
    });

    afterEach(() => {
      if (sessionId) {
        try { terminalsService.killSession(sessionId); } catch (e) {}
      }
    });

    test('listSessions returns active sessions', () => {
      const list = terminalsService.listSessions();
      expect(list.length).toBeGreaterThan(0);
      expect(list.find(s => s.sessionId === sessionId)).toBeDefined();
    });

    test('getSession returns correct session', () => {
      const session = terminalsService.getSession(sessionId);
      expect(session.sessionId).toBe(sessionId);
      expect(session.pty).toBe(mockPty);
    });

    test('writeSession writes to pty', () => {
      terminalsService.writeSession(sessionId, 'ls\n');
      expect(mockPty.write).toHaveBeenCalledWith('ls\n');
    });

    test('resizeSession resizes pty', () => {
      terminalsService.resizeSession(sessionId, 100, 40);
      expect(mockPty.resize).toHaveBeenCalledWith(100, 40);
    });

    test('killSession kills pty and removes session', () => {
      const result = terminalsService.killSession(sessionId);
      expect(result.ok).toBe(true);
      expect(mockPty.kill).toHaveBeenCalled();
      expect(terminalsService.getSession(sessionId)).toBeNull();
      sessionId = null; // Prevent afterEach from double killing
    });
  });
});
