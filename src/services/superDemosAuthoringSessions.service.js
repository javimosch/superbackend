const crypto = require('crypto');

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function newId(prefix) {
  const raw = crypto.randomBytes(16);
  return `${prefix}_${base64UrlEncode(raw)}`.toLowerCase();
}

function newToken() {
  const raw = crypto.randomBytes(32);
  return `sdt_${base64UrlEncode(raw)}`;
}

const sessions = new Map(); // sessionId -> session

function nowMs() {
  return Date.now();
}

function cleanupExpired() {
  const t = nowMs();
  for (const [id, s] of sessions.entries()) {
    if (s.expiresAtMs <= t) {
      sessions.delete(id);
      try {
        if (s.adminWs && s.adminWs.close) s.adminWs.close();
      } catch {}
      try {
        if (s.sdkWs && s.sdkWs.close) s.sdkWs.close();
      } catch {}
    }
  }
}

function createSession({ projectId = null, demoId = null, ttlMs = DEFAULT_TTL_MS } = {}) {
  cleanupExpired();

  const sessionId = newId('sd_sess');
  const token = newToken();

  const createdAtMs = nowMs();
  const expiresAtMs = createdAtMs + (Number(ttlMs) > 0 ? Number(ttlMs) : DEFAULT_TTL_MS);

  const session = {
    sessionId,
    token,
    projectId: projectId ? String(projectId) : null,
    demoId: demoId ? String(demoId) : null,
    createdAtMs,
    expiresAtMs,
    adminWs: null,
    sdkWs: null,
  };

  sessions.set(sessionId, session);
  return { sessionId, token, expiresAtMs };
}

function getSession(sessionId) {
  cleanupExpired();
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAtMs <= nowMs()) {
    sessions.delete(id);
    return null;
  }
  return s;
}

function validateToken(sessionId, token) {
  const s = getSession(sessionId);
  if (!s) return false;
  return String(s.token) === String(token || '');
}

function attachClient(sessionId, role, ws) {
  const s = getSession(sessionId);
  if (!s) return null;
  if (role === 'admin') s.adminWs = ws;
  if (role === 'sdk') s.sdkWs = ws;
  return s;
}

function detachClient(sessionId, role, ws) {
  const s = getSession(sessionId);
  if (!s) return null;
  if (role === 'admin' && s.adminWs === ws) s.adminWs = null;
  if (role === 'sdk' && s.sdkWs === ws) s.sdkWs = null;
  return s;
}

function destroySession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return false;
  const s = sessions.get(id);
  sessions.delete(id);
  if (s) {
    try {
      if (s.adminWs && s.adminWs.close) s.adminWs.close();
    } catch {}
    try {
      if (s.sdkWs && s.sdkWs.close) s.sdkWs.close();
    } catch {}
  }
  return Boolean(s);
}

function _resetForTests() {
  sessions.clear();
}

module.exports = {
  DEFAULT_TTL_MS,
  createSession,
  getSession,
  validateToken,
  attachClient,
  detachClient,
  destroySession,
  _resetForTests,
};
