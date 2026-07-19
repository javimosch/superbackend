const crypto = require('crypto');
const childProcess = require('child_process');

const sessions = new Map();

const MAX_SESSIONS = 20;
const IDLE_TTL_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// PTY Backend implementations
// ---------------------------------------------------------------------------

class NodePtyBackend {
  constructor(shell, cols, rows) {
    const nodePty = require('node-pty');
    this._pty = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env,
    });
    this.backendType = 'node-pty';
  }

  write(data) { this._pty.write(String(data || '')); }
  resize(cols, rows) { this._pty.resize(cols, rows); }
  kill() { this._pty.kill(); }
  onData(cb) { this._pty.onData(cb); }
  offData(cb) { try { this._pty.offData(cb); } catch (e) { console.error('[terminals] Failed to remove PTY data listener:', e?.message || e); } }
  onExit(cb) { this._pty.onExit(cb); }
}

class StdPtyBackend {
  constructor(shell, cols, rows) {
    this._proc = childProcess.spawn(shell, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'pty'],
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color', COLUMNS: String(cols), LINES: String(rows) },
    });
    this._dataCallbacks = [];
    this._exitCallbacks = [];
    this.backendType = 'std-pty';

    const emitData = (chunk) => this._dataCallbacks.forEach((cb) => cb(chunk.toString()));
    this._proc.stdout.on('data', emitData);
    this._proc.stderr.on('data', emitData);
    this._proc.on('exit', (code) => this._exitCallbacks.forEach((cb) => cb({ exitCode: code })));
  }

  write(data) { try { this._proc.stdin.write(String(data || '')); } catch (e) { console.error('[terminals] Failed to write to PTY stdin:', e?.message || e); } }

  resize(cols, rows) {
    try {
      process.kill(this._proc.pid, 'SIGWINCH');
      this._proc.env = { ...this._proc.env, COLUMNS: String(cols), LINES: String(rows) };
    } catch (e) {
      console.error('[terminals] Failed to resize PTY:', e?.message || e);
    }
  }

  kill() { try { this._proc.kill(); } catch (e) { console.error('[terminals] Failed to kill PTY process:', e?.message || e); } }
  onData(cb) { this._dataCallbacks.push(cb); }
  offData(cb) { this._dataCallbacks = this._dataCallbacks.filter((f) => f !== cb); }
  onExit(cb) { this._exitCallbacks.push(cb); }
}

class BasicSpawnBackend {
  constructor(shell, cols, rows) {
    this._proc = childProcess.spawn('script', ['-q', '-f', '-c', shell, '/dev/null'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color', COLUMNS: String(cols), LINES: String(rows) },
    });
    this._dataCallbacks = [];
    this._exitCallbacks = [];
    this.backendType = 'basic-spawn';

    const emitData = (chunk) => this._dataCallbacks.forEach((cb) => cb(chunk.toString()));
    this._proc.stdout.on('data', emitData);
    this._proc.stderr.on('data', emitData);
    this._proc.on('exit', (code) => this._exitCallbacks.forEach((cb) => cb({ exitCode: code })));
  }

  write(data) { try { this._proc.stdin.write(String(data || '')); } catch (e) { console.error('[terminals] Failed to write to PTY stdin:', e?.message || e); } }
  resize() {}
  kill() { try { this._proc.kill(); } catch (e) { console.error('[terminals] Failed to kill PTY process:', e?.message || e); } }
  onData(cb) { this._dataCallbacks.push(cb); }
  offData(cb) { this._dataCallbacks = this._dataCallbacks.filter((f) => f !== cb); }
  onExit(cb) { this._exitCallbacks.push(cb); }
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

function _detectBackendType() {
  try {
    require('node-pty');
    return 'node-pty';
  } catch {}
  return 'basic-spawn';
}

const _selectedBackendType = _detectBackendType();

function _createBackend(shell, cols, rows, backendType) {
  const type = backendType || _selectedBackendType;
  if (type === 'node-pty') return new NodePtyBackend(shell, cols, rows);
  if (type === 'std-pty') return new StdPtyBackend(shell, cols, rows);
  return new BasicSpawnBackend(shell, cols, rows);
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

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
      backendType: s.backendType,
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

  const backend = module.exports._createBackend(shell, cols, rows);
  const sessionId = newId();

  const s = {
    sessionId,
    backend,
    get pty() { return this.backend; },
    backendType: backend.backendType,
    status: 'running',
    createdAt: now(),
    lastActivityAt: now(),
    cols,
    rows,
  };

  backend.onExit(() => {
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
    s.backend.resize(c, r);
  } catch (e) {
    console.error('[terminals] Failed to resize terminal session:', e?.message || e);
  }
}

function writeSession(sessionId, data) {
  const s = getSession(sessionId);
  if (!s || s.status !== 'running') return;
  s.lastActivityAt = now();
  try {
    s.backend.write(String(data || ''));
  } catch (e) {
    console.error('[terminals] Failed to write to terminal session:', e?.message || e);
  }
}

function killSession(sessionId) {
  const s = getSession(sessionId);
  if (!s) {
    const err = new Error('Session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  try {
    s.backend.kill();
  } catch (e) {
    console.error('[terminals] Failed to kill terminal session:', e?.message || e);
  }

  sessions.delete(String(sessionId));
  return { ok: true };
}

function cleanupIdleSessions() {
  const cutoff = now() - IDLE_TTL_MS;
  for (const [id, s] of sessions.entries()) {
    if (s.lastActivityAt < cutoff) {
      try {
        s.backend.kill();
      } catch (e) {
        console.error('[terminals] Failed to kill idle terminal session:', e?.message || e);
      }
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
  _createBackend,
  _detectBackendType,
};
