const UiComponent = require('../models/UiComponent');
const UiComponentProject = require('../models/UiComponentProject');
const UiComponentProjectComponent = require('../models/UiComponentProjectComponent');

const { verifyKey } = require('../services/uiComponentsCrypto.service');

function extractProjectKey(req) {
  const headerToken = req.headers['x-project-key'] || req.headers['x-api-key'];
  if (headerToken) return String(headerToken).trim();
  return null;
}

async function loadAndAuthorizeProject(req, res, projectId) {
  const project = await UiComponentProject.findOne({ projectId: String(projectId), isActive: true }).lean();
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }

  if (!project.isPublic) {
    const key = extractProjectKey(req);
    const ok = project.apiKeyHash && verifyKey(key, project.apiKeyHash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid project key' });
      return null;
    }
  }

  return project;
}

exports.getManifest = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await loadAndAuthorizeProject(req, res, projectId);
    if (!project) return;

    const assignments = await UiComponentProjectComponent.find({ projectId: project.projectId, enabled: true }).lean();
    const codes = assignments.map((a) => a.componentCode);

    const components = await UiComponent.find({
      code: { $in: codes },
      isActive: true,
    })
      .sort({ code: 1 })
      .lean();

    const out = components.map((c) => ({
      code: c.code,
      name: c.name,
      version: c.version,
      html: c.html,
      js: c.js,
      css: c.css,
    }));

    return res.json({
      project: {
        projectId: project.projectId,
        name: project.name,
        isPublic: project.isPublic,
        allowedOrigins: project.allowedOrigins || [],
      },
      components: out,
    });
  } catch (error) {
    console.error('UI Components getManifest error:', error);
    return res.status(500).json({ error: 'Failed to load manifest' });
  }
};

exports.getComponent = async (req, res) => {
  try {
    const { projectId, code } = req.params;
    const project = await loadAndAuthorizeProject(req, res, projectId);
    if (!project) return;

    const componentCode = String(code || '').trim().toLowerCase();

    const assignment = await UiComponentProjectComponent.findOne({
      projectId: project.projectId,
      componentCode,
      enabled: true,
    }).lean();

    if (!assignment) return res.status(404).json({ error: 'Component not enabled for this project' });

    const component = await UiComponent.findOne({ code: componentCode, isActive: true }).lean();
    if (!component) return res.status(404).json({ error: 'Component not found' });

    return res.json({
      project: {
        projectId: project.projectId,
        isPublic: project.isPublic,
      },
      component: {
        code: component.code,
        name: component.name,
        version: component.version,
        html: component.html,
        js: component.js,
        css: component.css,
      },
    });
  } catch (error) {
    console.error('UI Components getComponent error:', error);
    return res.status(500).json({ error: 'Failed to load component' });
  }
};
