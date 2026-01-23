const crypto = require('crypto');
const pty = require('node-pty');

const sessions = new Map();

const MAX_SESSIONS = 20;
const IDLE_TTL_MS = 15 * 60 * 1000;

function now() {
  return Date.now();
}

function newId() {
  return crypto.randomBytes(16).toString('hex');
}

function listSessions() {
  return Array.from(sessions.values())
    .map((s) => ({
      sessionId: s.sessionId,
      status: s.status,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      cols: s.cols,
      rows: s.rows,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function getSession(sessionId) {
  return sessions.get(String(sessionId)) || null;
}

function createSession(options = {}) {
  if (sessions.size >= MAX_SESSIONS) {
    const err = new Error('Too many active terminal sessions');
    err.code = 'LIMIT';
    throw err;
  }

  const cols = Number(options.cols || 120);
  const rows = Number(options.rows || 30);

  const shell = process.env.SHELL || 'bash';

  const p = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: process.env,
  });

  const sessionId = newId();
  const s = {
    sessionId,
    pty: p,
    status: 'running',
    createdAt: now(),
    lastActivityAt: now(),
    cols,
    rows,
  };

  p.onExit(() => {
    const cur = sessions.get(sessionId);
    if (cur) {
      cur.status = 'closed';
      cur.lastActivityAt = now();
    }
  });

  sessions.set(sessionId, s);

  return { sessionId };
}

function touch(sessionId) {
  const s = sessions.get(String(sessionId));
  if (!s) return;
  s.lastActivityAt = now();
}

function resizeSession(sessionId, cols, rows) {
  const s = getSession(sessionId);
  if (!s || s.status !== 'running') return;
  const c = Number(cols || 0);
  const r = Number(rows || 0);
  if (!c || !r) return;
  s.cols = c;
  s.rows = r;
  s.lastActivityAt = now();
  try {
    s.pty.resize(c, r);
  } catch {}
}

function writeSession(sessionId, data) {
  const s = getSession(sessionId);
  if (!s || s.status !== 'running') return;
  s.lastActivityAt = now();
  try {
    s.pty.write(String(data || ''));
  } catch {}
}

function killSession(sessionId) {
  const s = getSession(sessionId);
  if (!s) {
    const err = new Error('Session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  try {
    s.pty.kill();
  } catch {}

  sessions.delete(String(sessionId));
  return { ok: true };
}

function cleanupIdleSessions() {
  const cutoff = now() - IDLE_TTL_MS;
  for (const [id, s] of sessions.entries()) {
    if (s.lastActivityAt < cutoff) {
      try {
        s.pty.kill();
      } catch {}
      sessions.delete(id);
    }
  }
}

let cleanupTimer = null;
function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupIdleSessions, 60 * 1000);
  cleanupTimer.unref();
}

ensureCleanupTimer();

module.exports = {
  createSession,
  listSessions,
  getSession,
  killSession,
  writeSession,
  resizeSession,
  touch,
};
