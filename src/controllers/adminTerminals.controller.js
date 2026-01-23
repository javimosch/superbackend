const {
  createSession,
  listSessions,
  killSession,
} = require('../services/terminals.service');

function handleError(res, err) {
  const msg = err?.message || 'Operation failed';
  const code = err?.code;
  if (code === 'NOT_FOUND') return res.status(404).json({ error: msg });
  if (code === 'LIMIT') return res.status(429).json({ error: msg });
  return res.status(500).json({ error: msg });
}

exports.createSession = async (req, res) => {
  try {
    const { cols, rows } = req.body || {};
    const result = createSession({ cols, rows });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
};

exports.listSessions = async (req, res) => {
  try {
    res.json({ items: listSessions() });
  } catch (err) {
    handleError(res, err);
  }
};

exports.killSession = async (req, res) => {
  try {
    res.json(killSession(req.params.sessionId));
  } catch (err) {
    handleError(res, err);
  }
};
