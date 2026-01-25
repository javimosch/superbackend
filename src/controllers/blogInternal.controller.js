const blogAutomationService = require('../services/blogAutomation.service');
const blogPublishingService = require('../services/blogPublishing.service');

exports.runAutomation = async (req, res) => {
  try {
    const trigger = req.body?.trigger === 'scheduled' ? 'scheduled' : 'manual';
    const run = await blogAutomationService.runBlogAutomation({ trigger });
    res.json({ run });
  } catch (error) {
    console.error('internal automation run error:', error);
    res.status(500).json({ error: 'Failed to run automation' });
  }
};

exports.publishScheduled = async (req, res) => {
  try {
    const limit = req.body?.limit;
    const result = await blogPublishingService.publishScheduledDue({ limit });
    res.json({ result });
  } catch (error) {
    console.error('internal publish scheduled error:', error);
    res.status(500).json({ error: 'Failed to publish scheduled posts' });
  }
};
