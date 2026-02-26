const SuperDemoProject = require('../models/SuperDemoProject');
const SuperDemo = require('../models/SuperDemo');
const SuperDemoStep = require('../models/SuperDemoStep');

const { verifyKey } = require('../services/uiComponentsCrypto.service');

function extractProjectKey(req) {
  const headerToken = req.headers['x-project-key'] || req.headers['x-api-key'];
  if (headerToken) return String(headerToken).trim();
  return null;
}

function normalizeUrl(v) {
  return String(v || '').trim();
}

async function loadAndAuthorizeProject(req, res, projectId) {
  const project = await SuperDemoProject.findOne({ projectId: String(projectId), isActive: true }).lean();
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

exports.listPublishedDemos = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await loadAndAuthorizeProject(req, res, projectId);
    if (!project) return;

    const urlFilter = normalizeUrl(req.query?.url);

    const demos = await SuperDemo.find({
      projectId: project.projectId,
      status: 'published',
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const items = demos
      .filter((d) => {
        if (!urlFilter) return true;
        if (!d.startUrlPattern) return true;
        return urlFilter.includes(String(d.startUrlPattern));
      })
      .map((d) => ({
        demoId: d.demoId,
        projectId: d.projectId,
        name: d.name,
        publishedVersion: d.publishedVersion || 0,
        publishedAt: d.publishedAt || null,
        startUrlPattern: d.startUrlPattern || null,
      }));

    return res.json({
      project: {
        projectId: project.projectId,
        name: project.name,
        isPublic: project.isPublic,
        allowedOrigins: project.allowedOrigins || [],
        stylePreset: project.stylePreset || 'default',
        styleOverrides: project.styleOverrides || '',
      },
      demos: items,
    });
  } catch (error) {
    console.error('SuperDemos listPublishedDemos error:', error);
    return res.status(500).json({ error: 'Failed to list demos' });
  }
};

exports.getPublishedDemoDefinition = async (req, res) => {
  try {
    const { demoId } = req.params;

    const demo = await SuperDemo.findOne({ demoId: String(demoId), status: 'published', isActive: true }).lean();
    if (!demo) return res.status(404).json({ error: 'Demo not found' });

    const project = await loadAndAuthorizeProject(req, res, demo.projectId);
    if (!project) return;

    const steps = await SuperDemoStep.find({ demoId: demo.demoId }).sort({ order: 1 }).lean();

    return res.json({
      project: {
        projectId: project.projectId,
        name: project.name,
        isPublic: project.isPublic,
        stylePreset: project.stylePreset || 'default',
        styleOverrides: project.styleOverrides || '',
      },
      demo: {
        demoId: demo.demoId,
        projectId: demo.projectId,
        name: demo.name,
        publishedVersion: demo.publishedVersion || 0,
        publishedAt: demo.publishedAt || null,
        startUrlPattern: demo.startUrlPattern || null,
      },
      steps: steps.map((s) => ({
        order: s.order,
        selector: s.selector,
        selectorHints: s.selectorHints || null,
        message: s.message,
        placement: s.placement,
        waitFor: s.waitFor || null,
        advance: s.advance || null,
      })),
    });
  } catch (error) {
    console.error('SuperDemos getPublishedDemoDefinition error:', error);
    return res.status(500).json({ error: 'Failed to load demo definition' });
  }
};
