const { WebSocketServer } = require('ws');
const url = require('url');

const subscribersByCode = new Map(); // experimentCode -> Set<ws>

function safeSend(ws, payload) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
  }
}

function normalizeCode(v) {
  return String(v || '').trim();
}

function broadcastWinnerChanged({ experimentCode, winnerVariantKey, decidedAt }) {
  const code = normalizeCode(experimentCode);
  if (!code) return;

  const subs = subscribersByCode.get(code);
  if (!subs || subs.size === 0) return;

  const msg = {
    type: 'winner',
    experimentCode: code,
    winnerVariantKey: winnerVariantKey || null,
    decidedAt: decidedAt ? new Date(decidedAt).toISOString() : null,
  };

  for (const ws of subs) {
    if (ws.readyState !== ws.OPEN) continue;
    safeSend(ws, msg);
  }
}

function attachExperimentsWebsocketServer(server) {
  const wsPath = '/api/experiments/ws';
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const parsed = url.parse(req.url, true);
    if (!parsed || parsed.pathname !== wsPath) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, parsed);
    });
  });

  wss.on('connection', (ws, _req, parsed) => {
    ws._sbExperimentSubs = new Set();

    safeSend(ws, { type: 'hello' });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw || ''));
      } catch {
        return;
      }

      const type = normalizeCode(msg?.type);
      const experimentCode = normalizeCode(msg?.experimentCode);

      if (type === 'subscribe') {
        if (!experimentCode) return;

        let set = subscribersByCode.get(experimentCode);
        if (!set) {
          set = new Set();
          subscribersByCode.set(experimentCode, set);
        }
        set.add(ws);
        ws._sbExperimentSubs.add(experimentCode);
        safeSend(ws, { type: 'subscribed', experimentCode });
        return;
      }

      if (type === 'unsubscribe') {
        if (!experimentCode) return;

        const set = subscribersByCode.get(experimentCode);
        if (set) {
          set.delete(ws);
          if (set.size === 0) subscribersByCode.delete(experimentCode);
        }
        ws._sbExperimentSubs.delete(experimentCode);
        safeSend(ws, { type: 'unsubscribed', experimentCode });
      }
    });

    ws.on('close', () => {
      for (const code of ws._sbExperimentSubs || []) {
        const set = subscribersByCode.get(code);
        if (set) {
          set.delete(ws);
          if (set.size === 0) subscribersByCode.delete(code);
        }
      }
    });

    ws.on('error', () => {
      for (const code of ws._sbExperimentSubs || []) {
        const set = subscribersByCode.get(code);
        if (set) {
          set.delete(ws);
          if (set.size === 0) subscribersByCode.delete(code);
        }
      }
    });

    // If query provides experimentCode, auto-subscribe.
    const q = parsed && parsed.query ? parsed.query : {};
    const initial = normalizeCode(q.experimentCode);
    if (initial) {
      let set = subscribersByCode.get(initial);
      if (!set) {
        set = new Set();
        subscribersByCode.set(initial, set);
      }
      set.add(ws);
      ws._sbExperimentSubs.add(initial);
      safeSend(ws, { type: 'subscribed', experimentCode: initial });
    }
  });

  return { wss, wsPath };
}

module.exports = {
  attachExperimentsWebsocketServer,
  broadcastWinnerChanged,
};
