const blogAutomationService = require('../services/blogAutomation.service');

exports.getConfig = async (req, res) => {
  res.status(400).json({
    error: 'Deprecated endpoint. Use /api/admin/blog-automation/configs instead.',
  });
};

exports.saveConfig = async (req, res) => {
  res.status(400).json({
    error: 'Deprecated endpoint. Use /api/admin/blog-automation/configs instead.',
  });
};

exports.listConfigs = async (req, res) => {
  try {
    const configs = await blogAutomationService.getBlogAutomationConfigs();
    res.json({ configs });
  } catch (error) {
    console.error('Error listing blog automation configs:', error);
    res.status(500).json({ error: 'Failed to load configs' });
  }
};

exports.previewPromptsByConfigId = async (req, res) => {
  try {
    const configId = String(req.params.id || '').trim();
    if (!configId) return res.status(400).json({ error: 'configId is required' });
    const prompts = await blogAutomationService.previewPromptsByConfigId(configId);
    res.json({ prompts });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    if (status !== 500) return res.status(status).json({ error: String(error?.message || 'Invalid request') });
    console.error('Error previewing blog automation prompts:', error);
    res.status(500).json({ error: 'Failed to preview prompts' });
  }
};

exports.getConfigById = async (req, res) => {
  try {
    const cfg = await blogAutomationService.getBlogAutomationConfigById(req.params.id);
    res.json({ config: cfg });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    if (status !== 500) return res.status(status).json({ error: String(error?.message || 'Invalid request') });
    console.error('Error getting blog automation config:', error);
    res.status(500).json({ error: 'Failed to load config' });
  }
};

exports.createConfig = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const created = await blogAutomationService.createAutomationConfig({ name });
    const blogCronsBootstrap = require('../services/blogCronsBootstrap.service');
    await blogCronsBootstrap.bootstrap();
    res.json({ config: created });
  } catch (error) {
    console.error('Error creating blog automation config:', error);
    res.status(500).json({ error: 'Failed to create config' });
  }
};

exports.updateConfigById = async (req, res) => {
  try {
    const config = req.body?.config;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config object is required' });
    }
    const updated = await blogAutomationService.updateAutomationConfig(req.params.id, config);
    const blogCronsBootstrap = require('../services/blogCronsBootstrap.service');
    await blogCronsBootstrap.bootstrap();
    res.json({ config: updated });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    if (status !== 500) return res.status(status).json({ error: String(error?.message || 'Invalid request') });
    console.error('Error updating blog automation config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
};

exports.deleteConfigById = async (req, res) => {
  try {
    await blogAutomationService.deleteAutomationConfig(req.params.id);
    const blogCronsBootstrap = require('../services/blogCronsBootstrap.service');
    await blogCronsBootstrap.bootstrap();
    res.json({ success: true });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    if (status !== 500) return res.status(status).json({ error: String(error?.message || 'Invalid request') });
    console.error('Error deleting blog automation config:', error);
    res.status(500).json({ error: 'Failed to delete config' });
  }
};

exports.getStyleGuide = async (req, res) => {
  try {
    const styleGuide = await blogAutomationService.getBlogAutomationStyleGuide();
    res.json({ styleGuide });
  } catch (error) {
    console.error('Error getting blog automation style guide:', error);
    res.status(500).json({ error: 'Failed to load style guide' });
  }
};

exports.saveStyleGuide = async (req, res) => {
  try {
    const styleGuide = String(req.body?.styleGuide ?? '');
    await blogAutomationService.updateStyleGuide(styleGuide);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving blog automation style guide:', error);
    res.status(500).json({ error: 'Failed to save style guide' });
  }
};

exports.listRuns = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30) || 30));
    const configId = String(req.query.configId || '').trim();
    const runs = await blogAutomationService.listRuns({ limit, configId });
    res.json({ runs });
  } catch (error) {
    console.error('Error listing blog automation runs:', error);
    res.status(500).json({ error: 'Failed to load runs' });
  }
};

exports.runNow = async (req, res) => {
  try {
    const configId = String(req.body?.configId || '').trim();
    if (!configId) return res.status(400).json({ error: 'configId is required' });
    const run = await blogAutomationService.runBlogAutomation({ trigger: 'manual', configId });
    res.json({ run });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    if (status !== 500) return res.status(status).json({ error: String(error?.message || 'Invalid request') });
    console.error('Error starting blog automation run:', error);
    res.status(500).json({ error: 'Failed to run automation' });
  }
};
