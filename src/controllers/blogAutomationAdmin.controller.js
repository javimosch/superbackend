const blogAutomationService = require('../services/blogAutomation.service');

exports.getConfig = async (req, res) => {
  try {
    const cfg = await blogAutomationService.getBlogAutomationConfig();
    res.json({ config: cfg });
  } catch (error) {
    console.error('Error getting blog automation config:', error);
    res.status(500).json({ error: 'Failed to load config' });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const config = req.body?.config;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config object is required' });
    }

    await blogAutomationService.updateConfig(config);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving blog automation config:', error);
    res.status(500).json({ error: 'Failed to save config' });
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
    const runs = await blogAutomationService.listRuns({ limit });
    res.json({ runs });
  } catch (error) {
    console.error('Error listing blog automation runs:', error);
    res.status(500).json({ error: 'Failed to load runs' });
  }
};

exports.runNow = async (req, res) => {
  try {
    const run = await blogAutomationService.runBlogAutomation({ trigger: 'manual' });
    res.json({ run });
  } catch (error) {
    console.error('Error starting blog automation run:', error);
    res.status(500).json({ error: 'Failed to run automation' });
  }
};
