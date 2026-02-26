const sessions = require('./superDemosAuthoringSessions.service');

describe('superDemosAuthoringSessions.service', () => {
  beforeEach(() => {
    sessions._resetForTests();
  });

  test('createSession returns sessionId/token and validates token', () => {
    const { sessionId, token } = sessions.createSession({ projectId: 'sdp_test', demoId: 'demo_test', ttlMs: 1000 });
    expect(typeof sessionId).toBe('string');
    expect(sessionId).toMatch(/^sd_sess_/);
    expect(typeof token).toBe('string');
    expect(token).toMatch(/^sdt_/);

    expect(sessions.validateToken(sessionId, token)).toBe(true);
    expect(sessions.validateToken(sessionId, 'wrong')).toBe(false);
  });

  test('getSession returns null after expiry', () => {
    const realNow = Date.now;
    let t = 1000;
    Date.now = () => t;

    const { sessionId } = sessions.createSession({ ttlMs: 50 });
    expect(sessions.getSession(sessionId)).toBeTruthy();

    t += 51;
    expect(sessions.getSession(sessionId)).toBeNull();

    Date.now = realNow;
  });

  test('destroySession removes session and returns true if existed', () => {
    const { sessionId } = sessions.createSession({ ttlMs: 1000 });
    expect(sessions.getSession(sessionId)).toBeTruthy();
    expect(sessions.destroySession(sessionId)).toBe(true);
    expect(sessions.getSession(sessionId)).toBeNull();
    expect(sessions.destroySession(sessionId)).toBe(false);
  });
});
