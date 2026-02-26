const { WebSocketServer } = require('ws');
const url = require('url');

const SuperDemoProject = require('../models/SuperDemoProject');
const sessions = require('./superDemosAuthoringSessions.service');

function toStr(v) {
  return v === undefined || v === null ? '' : String(v);
}

function normalizeOrigin(o) {
  const s = toStr(o).trim();
  return s.replace(/\/$/, '');
}

function safeSend(ws, payload) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {}
}

function parseAndValidateQuery(parsed) {
  const q = parsed && parsed.query ? parsed.query : {};
  const sessionId = toStr(q.sessionId).trim();
  const role = toStr(q.role).trim().toLowerCase();
  const token = toStr(q.token).trim();

  if (!sessionId || !token) return { ok: false, error: 'Missing sessionId/token' };
  if (role !== 'admin' && role !== 'sdk') return { ok: false, error: 'Invalid role' };
  if (!sessions.validateToken(sessionId, token)) return { ok: false, error: 'Invalid session' };

  return { ok: true, sessionId, role, token };
}

async function isOriginAllowedForSession(req, session) {
  // If no projectId, skip allowlist enforcement.
  if (!session || !session.projectId) return true;

  const origin = normalizeOrigin(req.headers?.origin);
  // If origin header is missing (some WS clients), allow.
  if (!origin) return true;

  let project;
  try {
    project = await SuperDemoProject.findOne({ projectId: session.projectId, isActive: true }).lean();
  } catch {
    // If DB lookup fails, fail open for now (v1).
    return true;
  }
  if (!project) return true;

  const allowed = Array.isArray(project.allowedOrigins) ? project.allowedOrigins : [];
  if (allowed.length === 0) return true;

  const allowedNorm = allowed.map(normalizeOrigin).filter(Boolean);
  return allowedNorm.includes(origin);
}

function attachSuperDemosWebsocketServer(server) {
  const wsPath = '/api/superdemos/ws';
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const parsed = url.parse(req.url, true);
    if (!parsed || parsed.pathname !== wsPath) return;

    const validated = parseAndValidateQuery(parsed);
    if (!validated.ok) {
      try {
        socket.destroy();
      } catch {}
      return;
    }

    const session = sessions.getSession(validated.sessionId);
    if (!session) {
      try {
        socket.destroy();
      } catch {}
      return;
    }

    if (validated.role === 'sdk') {
      const okOrigin = await isOriginAllowedForSession(req, session);
      if (!okOrigin) {
        try {
          socket.destroy();
        } catch {}
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, parsed);
    });
  });

  wss.on('connection', (ws, _req, parsed) => {
    const validated = parseAndValidateQuery(parsed);
    if (!validated.ok) {
      safeSend(ws, { type: 'error', error: validated.error });
      ws.close();
      return;
    }

    const { sessionId, role } = validated;
    const session = sessions.attachClient(sessionId, role, ws);
    if (!session) {
      safeSend(ws, { type: 'error', error: 'Session expired' });
      ws.close();
      return;
    }

    ws._sbSuperDemos = { sessionId, role };

    safeSend(ws, { type: 'hello', sessionId, role, expiresAtMs: session.expiresAtMs });

    const peer = role === 'admin' ? session.sdkWs : session.adminWs;
    if (peer && peer.readyState === peer.OPEN) {
      safeSend(ws, { type: 'peer_status', peerRole: role === 'admin' ? 'sdk' : 'admin', status: 'connected' });
    } else {
      safeSend(ws, { type: 'peer_status', peerRole: role === 'admin' ? 'sdk' : 'admin', status: 'disconnected' });
    }

    // Notify other side.
    if (peer && peer.readyState === peer.OPEN) {
      safeSend(peer, { type: 'peer_status', peerRole: role, status: 'connected' });
    }

    ws.on('message', (raw) => {
      const s = sessions.getSession(sessionId);
      if (!s) return;

      const other = role === 'admin' ? s.sdkWs : s.adminWs;
      if (!other || other.readyState !== other.OPEN) return;

      // Relay as-is if it is valid JSON.
      try {
        const msg = JSON.parse(toStr(raw));
        safeSend(other, msg);
      } catch {
        // ignore invalid frames
      }
    });

    function cleanup() {
      const s = sessions.detachClient(sessionId, role, ws);
      if (!s) return;
      const other = role === 'admin' ? s.sdkWs : s.adminWs;
      if (other && other.readyState === other.OPEN) {
        safeSend(other, { type: 'peer_status', peerRole: role, status: 'disconnected' });
      }
    }

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  return { wss, wsPath };
}

module.exports = {
  attachSuperDemosWebsocketServer,
};
