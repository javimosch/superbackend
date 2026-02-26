const SuperDemoProject = require('../models/SuperDemoProject');
const SuperDemo = require('../models/SuperDemo');
const SuperDemoStep = require('../models/SuperDemoStep');

const {
  generateProjectApiKeyPlaintext,
  hashKey,
} = require('../services/uiComponentsCrypto.service');

const authoringSessions = require('../services/superDemosAuthoringSessions.service');

function randomLowerAlphaNum(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normalizeStylePreset(value) {
  const allowed = new Set(['default', 'glass-dark', 'high-contrast', 'soft-purple']);
  const v = String(value || 'default').trim().toLowerCase();
  return allowed.has(v) ? v : 'default';
}

function normalizeStyleOverrides(value) {
  const raw = String(value || '');
  return raw.length > 20000 ? raw.slice(0, 20000) : raw;
}

function generateProjectId() {
  return `sdp_${randomLowerAlphaNum(16)}`;
}

function generateDemoId() {
  return `demo_${randomLowerAlphaNum(16)}`;
}

function parseBool(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

function addQueryParam(urlStr, key, value) {
  const u = new URL(urlStr);
  u.searchParams.set(key, value);
  return u.toString();
}

exports.listProjects = async (req, res) => {
  try {
    const items = await SuperDemoProject.find({}).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('SuperDemos listProjects error:', error);
    return res.status(500).json({ error: 'Failed to list projects' });
  }
};

exports.createProject = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const projectIdIn = req.body?.projectId !== undefined ? String(req.body.projectId).trim() : '';
    const isPublic = parseBool(req.body?.isPublic, true);

    if (!name) return res.status(400).json({ error: 'name is required' });

    const projectId = projectIdIn || generateProjectId();

    const doc = await SuperDemoProject.create({
      projectId,
      name,
      isPublic,
      apiKeyHash: null,
      allowedOrigins: Array.isArray(req.body?.allowedOrigins) ? req.body.allowedOrigins : [],
      stylePreset: normalizeStylePreset(req.body?.stylePreset),
      styleOverrides: normalizeStyleOverrides(req.body?.styleOverrides),
      isActive: true,
    });

    let apiKey = null;
    if (!isPublic) {
      apiKey = generateProjectApiKeyPlaintext();
      doc.apiKeyHash = hashKey(apiKey);
      await doc.save();
    }

    return res.status(201).json({ item: doc.toObject(), apiKey });
  } catch (error) {
    console.error('SuperDemos createProject error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    if (error?.code === 11000) return res.status(409).json({ error: 'Project already exists' });
    return res.status(500).json({ error: 'Failed to create project' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const doc = await SuperDemoProject.findOne({ projectId: String(projectId) });
    if (!doc) return res.status(404).json({ error: 'Project not found' });

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      doc.name = name;
    }

    if (req.body?.isPublic !== undefined) {
      const nextPublic = parseBool(req.body.isPublic, doc.isPublic);
      if (nextPublic !== doc.isPublic) {
        doc.isPublic = nextPublic;
        if (doc.isPublic) {
          doc.apiKeyHash = null;
        } else if (!doc.apiKeyHash) {
          const apiKey = generateProjectApiKeyPlaintext();
          doc.apiKeyHash = hashKey(apiKey);
          await doc.save();
          return res.json({ item: doc.toObject(), apiKey });
        }
      }
    }

    if (req.body?.allowedOrigins !== undefined) {
      doc.allowedOrigins = Array.isArray(req.body.allowedOrigins) ? req.body.allowedOrigins : [];
    }

    if (req.body?.stylePreset !== undefined) {
      doc.stylePreset = normalizeStylePreset(req.body.stylePreset);
    }

    if (req.body?.styleOverrides !== undefined) {
      doc.styleOverrides = normalizeStyleOverrides(req.body.styleOverrides);
    }

    if (req.body?.isActive !== undefined) {
      doc.isActive = Boolean(req.body.isActive);
    }

    await doc.save();
    return res.json({ item: doc.toObject(), apiKey: null });
  } catch (error) {
    console.error('SuperDemos updateProject error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to update project' });
  }
};

exports.rotateProjectKey = async (req, res) => {
  try {
    const { projectId } = req.params;
    const doc = await SuperDemoProject.findOne({ projectId: String(projectId) });
    if (!doc) return res.status(404).json({ error: 'Project not found' });
    if (doc.isPublic) return res.status(400).json({ error: 'Project is public' });

    const apiKey = generateProjectApiKeyPlaintext();
    doc.apiKeyHash = hashKey(apiKey);
    await doc.save();

    return res.json({ item: doc.toObject(), apiKey });
  } catch (error) {
    console.error('SuperDemos rotateProjectKey error:', error);
    return res.status(500).json({ error: 'Failed to rotate key' });
  }
};

exports.listProjectDemos = async (req, res) => {
  try {
    const projectId = String(req.params.projectId || '').trim();
    const project = await SuperDemoProject.findOne({ projectId }).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const items = await SuperDemo.find({ projectId }).sort({ updatedAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('SuperDemos listProjectDemos error:', error);
    return res.status(500).json({ error: 'Failed to list demos' });
  }
};

exports.createDemo = async (req, res) => {
  try {
    const projectId = String(req.params.projectId || '').trim();
    const project = await SuperDemoProject.findOne({ projectId }).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const demoId = generateDemoId();
    const startUrlPattern = req.body?.startUrlPattern !== undefined ? String(req.body.startUrlPattern || '').trim() || null : null;

    const doc = await SuperDemo.create({
      demoId,
      projectId,
      name,
      status: 'draft',
      publishedVersion: 0,
      publishedAt: null,
      startUrlPattern,
      isActive: true,
    });

    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('SuperDemos createDemo error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to create demo' });
  }
};

exports.getDemo = async (req, res) => {
  try {
    const { demoId } = req.params;
    const item = await SuperDemo.findOne({ demoId: String(demoId) }).lean();
    if (!item) return res.status(404).json({ error: 'Demo not found' });
    return res.json({ item });
  } catch (error) {
    console.error('SuperDemos getDemo error:', error);
    return res.status(500).json({ error: 'Failed to load demo' });
  }
};

exports.updateDemo = async (req, res) => {
  try {
    const { demoId } = req.params;
    const doc = await SuperDemo.findOne({ demoId: String(demoId) });
    if (!doc) return res.status(404).json({ error: 'Demo not found' });

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      doc.name = name;
    }

    if (req.body?.startUrlPattern !== undefined) {
      const p = String(req.body.startUrlPattern || '').trim();
      doc.startUrlPattern = p ? p : null;
    }

    if (req.body?.isActive !== undefined) {
      doc.isActive = Boolean(req.body.isActive);
    }

    await doc.save();
    return res.json({ item: doc.toObject() });
  } catch (error) {
    console.error('SuperDemos updateDemo error:', error);
    return res.status(500).json({ error: 'Failed to update demo' });
  }
};

exports.publishDemo = async (req, res) => {
  try {
    const { demoId } = req.params;
    const doc = await SuperDemo.findOne({ demoId: String(demoId) });
    if (!doc) return res.status(404).json({ error: 'Demo not found' });

    doc.status = 'published';
    doc.publishedVersion = Number(doc.publishedVersion || 0) + 1;
    doc.publishedAt = new Date();
    await doc.save();

    return res.json({ item: doc.toObject() });
  } catch (error) {
    console.error('SuperDemos publishDemo error:', error);
    return res.status(500).json({ error: 'Failed to publish demo' });
  }
};

exports.listSteps = async (req, res) => {
  try {
    const { demoId } = req.params;
    const demo = await SuperDemo.findOne({ demoId: String(demoId) }).lean();
    if (!demo) return res.status(404).json({ error: 'Demo not found' });

    const items = await SuperDemoStep.find({ demoId: demo.demoId }).sort({ order: 1 }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('SuperDemos listSteps error:', error);
    return res.status(500).json({ error: 'Failed to list steps' });
  }
};

exports.replaceSteps = async (req, res) => {
  try {
    const { demoId } = req.params;
    const demo = await SuperDemo.findOne({ demoId: String(demoId) }).lean();
    if (!demo) return res.status(404).json({ error: 'Demo not found' });

    const steps = Array.isArray(req.body?.steps) ? req.body.steps : null;
    if (!steps) return res.status(400).json({ error: 'steps array is required' });

    const docs = steps.map((s, idx) => {
      const selector = String(s?.selector || '').trim();
      const message = String(s?.message || '').trim();
      if (!selector) throw new Error(`steps[${idx}].selector is required`);
      if (!message) throw new Error(`steps[${idx}].message is required`);

      const placement = String(s?.placement || 'auto').trim().toLowerCase();
      const allowedPlacements = new Set(['top', 'bottom', 'left', 'right', 'auto']);

      return {
        demoId: demo.demoId,
        order: idx,
        selector,
        selectorHints: s?.selectorHints !== undefined ? s.selectorHints : null,
        message,
        placement: allowedPlacements.has(placement) ? placement : 'auto',
        waitFor: s?.waitFor !== undefined ? s.waitFor : null,
        advance: s?.advance !== undefined ? s.advance : { type: 'manualNext' },
      };
    });

    await SuperDemoStep.deleteMany({ demoId: demo.demoId });
    if (docs.length > 0) await SuperDemoStep.insertMany(docs);

    const items = await SuperDemoStep.find({ demoId: demo.demoId }).sort({ order: 1 }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('SuperDemos replaceSteps error:', error);
    const msg = String(error?.message || 'Failed to update steps');
    if (msg.startsWith('steps[')) return res.status(400).json({ error: msg });
    return res.status(500).json({ error: 'Failed to update steps' });
  }
};

exports.createAuthoringSession = async (req, res) => {
  try {
    const demoId = String(req.body?.demoId || '').trim();
    const targetUrl = String(req.body?.targetUrl || '').trim();

    if (!demoId) return res.status(400).json({ error: 'demoId is required' });
    if (!targetUrl) return res.status(400).json({ error: 'targetUrl is required' });

    let demo;
    try {
      demo = await SuperDemo.findOne({ demoId }).lean();
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load demo' });
    }
    if (!demo) return res.status(404).json({ error: 'Demo not found' });

    const created = authoringSessions.createSession({ projectId: demo.projectId, demoId: demo.demoId });

    let connectUrl;
    try {
      connectUrl = targetUrl;
      connectUrl = addQueryParam(connectUrl, 'sd_author', '1');
      connectUrl = addQueryParam(connectUrl, 'sd_session', created.sessionId);
      connectUrl = addQueryParam(connectUrl, 'sd_token', created.token);
      connectUrl = addQueryParam(connectUrl, 'sd_demoId', demo.demoId);
    } catch {
      return res.status(400).json({ error: 'Invalid targetUrl' });
    }

    return res.status(201).json({
      sessionId: created.sessionId,
      token: created.token,
      expiresAtMs: created.expiresAtMs,
      connectUrl,
    });
  } catch (error) {
    console.error('SuperDemos createAuthoringSession error:', error);
    return res.status(500).json({ error: 'Failed to create authoring session' });
  }
};

exports.deleteAuthoringSession = async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    const ok = authoringSessions.destroySession(sessionId);
    return res.json({ success: ok });
  } catch (error) {
    console.error('SuperDemos deleteAuthoringSession error:', error);
    return res.status(500).json({ error: 'Failed to delete authoring session' });
  }
};
