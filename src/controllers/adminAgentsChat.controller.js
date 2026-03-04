const crypto = require('crypto');
const Agent = require('../models/Agent');
const JsonConfig = require('../models/JsonConfig');
const agentService = require('../services/agent.service');

function safeParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

exports.newSession = async (req, res) => {
  try {
    const { agentId } = req.body || {};
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });

    const agent = await Agent.findById(agentId).select('_id').lean();
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    return res.json({ chatId: `web-${Date.now()}-${crypto.randomUUID().slice(0, 8)}` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.listSessions = async (req, res) => {
  try {
    const { agentId } = req.query;
    const docs = await JsonConfig.find({ alias: { $regex: /^agent-session-/ } })
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean();

    const items = docs
      .map((doc) => {
        const parsed = safeParse(doc.jsonRaw, {});
        return {
          id: parsed.id,
          agentId: parsed.agentId,
          label: parsed.label || null,
          totalTokens: parsed.totalTokens || 0,
          lastSnapshotId: parsed.lastSnapshotId || null,
          updatedAt: doc.updatedAt,
        };
      })
      .filter((x) => x.id)
      .filter((x) => !agentId || String(x.agentId) === String(agentId));

    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.renameSession = async (req, res) => {
  try {
    const { chatId, label } = req.body || {};
    if (!chatId || !label) return res.status(400).json({ error: 'chatId and label are required' });
    const result = await agentService.renameSession(chatId, label);
    if (!result.success) return res.status(400).json({ error: result.message || 'Failed to rename session' });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.compactSession = async (req, res) => {
  try {
    const { agentId, chatId } = req.body || {};
    if (!agentId || !chatId) return res.status(400).json({ error: 'agentId and chatId are required' });
    const result = await agentService.compactSession(agentId, chatId);
    if (!result.success) return res.status(400).json({ error: result.message || 'Failed to compact session' });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { agentId, chatId, content } = req.body || {};
    if (!agentId || !content) return res.status(400).json({ error: 'agentId and content are required' });

    const senderId = String(req.session?.adminUser?._id || req.session?.user?._id || 'admin-web');
    const response = await agentService.processMessage(
      agentId,
      { content, senderId, chatId },
      {},
    );

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.streamMessage = async (req, res) => {
  try {
    const { agentId, chatId, content } = req.body || {};
    if (!agentId || !content) return res.status(400).json({ error: 'agentId and content are required' });

    const senderId = String(req.session?.adminUser?._id || req.session?.user?._id || 'admin-web');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    const writeEvent = (event, payload) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    writeEvent('status', { status: 'starting' });

    const response = await agentService.processMessage(
      agentId,
      { content, senderId, chatId },
      {
        onProgress: (p) => writeEvent('progress', p),
      },
    );

    writeEvent('done', response);
    res.end();
  } catch (error) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
};

exports.loadSessionMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    console.log('[loadSessionMessages] Loading messages for chatId:', chatId);
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });

    const doc = await JsonConfig.findOne({ 
      'jsonRaw.id': chatId,
      alias: { $regex: /^agent-session-/ }
    }).lean();
    
    console.log('[loadSessionMessages] Found document:', !!doc);

    if (!doc) return res.status(404).json({ error: 'Session not found' });

    const parsed = safeParse(doc.jsonRaw, {});
    const messages = parsed.messages || [];
    console.log('[loadSessionMessages] Messages count:', messages.length);

    return res.json({ 
      chatId: parsed.id,
      agentId: parsed.agentId,
      label: parsed.label,
      messages,
      totalTokens: parsed.totalTokens || 0,
      updatedAt: doc.updatedAt
    });
  } catch (error) {
    console.error('[loadSessionMessages] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};

exports.chatHealth = async (_req, res) => {
  const uri = process.env.MONGODB_URI || '';
  const dbName = uri.split('/').pop()?.split('?')[0] || 'unknown';
  return res.json({ dbName });
};
