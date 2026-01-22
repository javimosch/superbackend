const UiComponent = require('../models/UiComponent');
const UiComponentProject = require('../models/UiComponentProject');
const UiComponentProjectComponent = require('../models/UiComponentProjectComponent');

const {
  generateProjectApiKeyPlaintext,
  hashKey,
} = require('../services/uiComponentsCrypto.service');

function randomLowerAlphaNum(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function generateProjectId() {
  return `prj_${randomLowerAlphaNum(16)}`;
}

function parseBool(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

exports.listProjects = async (req, res) => {
  try {
    const items = await UiComponentProject.find({}).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('UI Components listProjects error:', error);
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

    const doc = await UiComponentProject.create({
      projectId,
      name,
      isPublic,
      apiKeyHash: null,
      allowedOrigins: Array.isArray(req.body?.allowedOrigins) ? req.body.allowedOrigins : [],
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
    console.error('UI Components createProject error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    if (error?.code === 11000) return res.status(409).json({ error: 'Project already exists' });
    return res.status(500).json({ error: 'Failed to create project' });
  }
};

exports.getProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const item = await UiComponentProject.findOne({ projectId: String(projectId) }).lean();
    if (!item) return res.status(404).json({ error: 'Project not found' });

    const assigned = await UiComponentProjectComponent.find({ projectId: item.projectId }).lean();
    return res.json({ item, assigned });
  } catch (error) {
    console.error('UI Components getProject error:', error);
    return res.status(500).json({ error: 'Failed to load project' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const doc = await UiComponentProject.findOne({ projectId: String(projectId) });
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

    if (req.body?.isActive !== undefined) {
      doc.isActive = Boolean(req.body.isActive);
    }

    await doc.save();
    return res.json({ item: doc.toObject(), apiKey: null });
  } catch (error) {
    console.error('UI Components updateProject error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to update project' });
  }
};

exports.rotateProjectKey = async (req, res) => {
  try {
    const { projectId } = req.params;
    const doc = await UiComponentProject.findOne({ projectId: String(projectId) });
    if (!doc) return res.status(404).json({ error: 'Project not found' });
    if (doc.isPublic) return res.status(400).json({ error: 'Project is public' });

    const apiKey = generateProjectApiKeyPlaintext();
    doc.apiKeyHash = hashKey(apiKey);
    await doc.save();

    return res.json({ item: doc.toObject(), apiKey });
  } catch (error) {
    console.error('UI Components rotateProjectKey error:', error);
    return res.status(500).json({ error: 'Failed to rotate key' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const doc = await UiComponentProject.findOne({ projectId: String(projectId) });
    if (!doc) return res.status(404).json({ error: 'Project not found' });

    await UiComponentProjectComponent.deleteMany({ projectId: doc.projectId });
    await UiComponentProject.deleteOne({ _id: doc._id });
    return res.json({ success: true });
  } catch (error) {
    console.error('UI Components deleteProject error:', error);
    return res.status(500).json({ error: 'Failed to delete project' });
  }
};

exports.listComponents = async (req, res) => {
  try {
    const items = await UiComponent.find({}).sort({ updatedAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('UI Components listComponents error:', error);
    return res.status(500).json({ error: 'Failed to list components' });
  }
};

exports.createComponent = async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    if (!code) return res.status(400).json({ error: 'code is required' });
    if (!name) return res.status(400).json({ error: 'name is required' });

    const doc = await UiComponent.create({
      code,
      name,
      html: String(req.body?.html || ''),
      js: String(req.body?.js || ''),
      css: String(req.body?.css || ''),
      api: req.body?.api !== undefined ? req.body.api : null,
      usageMarkdown: String(req.body?.usageMarkdown || ''),
      version: Number(req.body?.version || 1) || 1,
      isActive: parseBool(req.body?.isActive, true),
    });

    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('UI Components createComponent error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    if (error?.code === 11000) return res.status(409).json({ error: 'Component already exists' });
    return res.status(500).json({ error: 'Failed to create component' });
  }
};

exports.getComponent = async (req, res) => {
  try {
    const { code } = req.params;
    const item = await UiComponent.findOne({ code: String(code).toLowerCase() }).lean();
    if (!item) return res.status(404).json({ error: 'Component not found' });
    return res.json({ item });
  } catch (error) {
    console.error('UI Components getComponent error:', error);
    return res.status(500).json({ error: 'Failed to load component' });
  }
};

exports.updateComponent = async (req, res) => {
  try {
    const { code } = req.params;
    const doc = await UiComponent.findOne({ code: String(code).toLowerCase() });
    if (!doc) return res.status(404).json({ error: 'Component not found' });

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      doc.name = name;
    }
    if (req.body?.html !== undefined) doc.html = String(req.body.html || '');
    if (req.body?.js !== undefined) doc.js = String(req.body.js || '');
    if (req.body?.css !== undefined) doc.css = String(req.body.css || '');
    if (req.body?.api !== undefined) doc.api = req.body.api;
    if (req.body?.usageMarkdown !== undefined) doc.usageMarkdown = String(req.body.usageMarkdown || '');

    if (req.body?.version !== undefined) {
      const v = Number(req.body.version);
      if (!Number.isFinite(v) || v < 1) return res.status(400).json({ error: 'version must be a positive number' });
      doc.version = v;
    } else {
      doc.version = Number(doc.version || 1) + 1;
    }

    if (req.body?.isActive !== undefined) doc.isActive = Boolean(req.body.isActive);

    await doc.save();
    return res.json({ item: doc.toObject() });
  } catch (error) {
    console.error('UI Components updateComponent error:', error);
    if (error?.name === 'ValidationError') return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to update component' });
  }
};

exports.deleteComponent = async (req, res) => {
  try {
    const { code } = req.params;
    const doc = await UiComponent.findOne({ code: String(code).toLowerCase() });
    if (!doc) return res.status(404).json({ error: 'Component not found' });

    await UiComponentProjectComponent.deleteMany({ componentCode: doc.code });
    await UiComponent.deleteOne({ _id: doc._id });
    return res.json({ success: true });
  } catch (error) {
    console.error('UI Components deleteComponent error:', error);
    return res.status(500).json({ error: 'Failed to delete component' });
  }
};

exports.setAssignment = async (req, res) => {
  try {
    const projectId = String(req.params.projectId || '').trim();
    const code = String(req.params.code || '').trim().toLowerCase();
    const enabled = parseBool(req.body?.enabled, true);

    const project = await UiComponentProject.findOne({ projectId }).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const component = await UiComponent.findOne({ code }).lean();
    if (!component) return res.status(404).json({ error: 'Component not found' });

    const doc = await UiComponentProjectComponent.findOneAndUpdate(
      { projectId, componentCode: code },
      { $set: { enabled } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.json({ item: doc.toObject() });
  } catch (error) {
    console.error('UI Components setAssignment error:', error);
    if (error?.code === 11000) return res.status(409).json({ error: 'Assignment already exists' });
    return res.status(500).json({ error: 'Failed to set assignment' });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const projectId = String(req.params.projectId || '').trim();
    const code = String(req.params.code || '').trim().toLowerCase();

    await UiComponentProjectComponent.deleteOne({ projectId, componentCode: code });
    return res.json({ success: true });
  } catch (error) {
    console.error('UI Components deleteAssignment error:', error);
    return res.status(500).json({ error: 'Failed to delete assignment' });
  }
};

exports.listProjectAssignments = async (req, res) => {
  try {
    const projectId = String(req.params.projectId || '').trim();
    const items = await UiComponentProjectComponent.find({ projectId }).lean();
    return res.json({ items });
  } catch (error) {
    console.error('UI Components listProjectAssignments error:', error);
    return res.status(500).json({ error: 'Failed to list assignments' });
  }
};
