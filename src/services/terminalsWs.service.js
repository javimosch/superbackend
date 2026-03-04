const { WebSocketServer } = require('ws');
const url = require('url');

const { createSession, getSession, writeSession, resizeSession, touch } = require('./terminals.service');

function isBasicAuthValid(req, options) {
  const authHeader = req.headers['authorization'] || '';
  if (!String(authHeader).startsWith('Basic ')) return false;

  const decoded = Buffer.from(String(authHeader).slice(6), 'base64').toString('utf-8');
  const parts = decoded.split(':');
  const username = parts[0] || '';
  const password = parts.slice(1).join(':') || '';

  const adminUsername = (options && options.adminUsername) || process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = (options && options.adminPassword) || process.env.ADMIN_PASSWORD || 'admin';

  return username === adminUsername && password === adminPassword;
}

function attachTerminalWebsocketServer(server, options = {}) {
  const wsPath = '/api/admin/terminals/ws';

  const wss = new WebSocketServer({ noServer: true });

  console.log(`[Terminals] WebSocket upgrade path: ${wsPath}`);

  server.on('upgrade', (req, socket, head) => {
    const parsed = url.parse(req.url, true);
    if (!parsed || parsed.pathname !== wsPath) return;

    //console.log(`[Terminals] WebSocket upgrade request for ${parsed.pathname}`);
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, parsed);
    });
  });

  wss.on('connection', (ws, req, parsed) => {
    const q = parsed && parsed.query ? parsed.query : {};
    let sessionId = q.sessionId ? String(q.sessionId) : null;

    if (!sessionId) {
      const created = createSession({ cols: 120, rows: 30 });
      sessionId = created.sessionId;
      ws.send(JSON.stringify({ type: 'session', sessionId }));
    }

    const s = getSession(sessionId);
    if (!s || s.status !== 'running') {
      ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }));
      ws.close();
      return;
    }

    ws.send(JSON.stringify({ type: 'status', status: 'running', sessionId }));

    const onData = (data) => {
      try {
        ws.send(JSON.stringify({ type: 'output', data: String(data || '') }));
      } catch {}
    };

    s.pty.onData(onData);

    // Enhanced message handler with ping/pong support
    ws.on('message', (raw) => {
      touch(sessionId);
      let msg;
      try {
        msg = JSON.parse(String(raw || ''));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'input') {
        writeSession(sessionId, msg.data);
      }

      if (msg.type === 'resize') {
        resizeSession(sessionId, msg.cols, msg.rows);
      }

      // Handle ping messages with pong response
      if (msg.type === 'ping') {
        try {
          ws.send(JSON.stringify({ type: 'pong' }));
          console.log(`[Terminals] Pong sent for session ${sessionId}`);
        } catch (error) {
          console.error(`[Terminals] Failed to send pong for session ${sessionId}:`, error);
        }
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[Terminals] WebSocket closed for session ${sessionId}, code: ${code}, reason: ${reason}`);
      try {
        s.pty.offData(onData);
      } catch {}
    });

    ws.on('error', (error) => {
      console.error(`[Terminals] WebSocket error for session ${sessionId}:`, error);
      try {
        s.pty.offData(onData);
      } catch {}
    });

    // Set up connection timeout detection
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error(`[Terminals] Failed to send server ping for session ${sessionId}:`, error);
          clearInterval(pingInterval);
          ws.close();
        }
      } else {
        clearInterval(pingInterval);
      }
    }, 45000); // Server ping every 45 seconds

    ws.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  return { wss, wsPath };
}

module.exports = { attachTerminalWebsocketServer };
