const fileManagerStoragePolicyService = require('../services/fileManagerStoragePolicy.service');

exports.getStoragePolicy = async (req, res) => {
  try {
    const orgId = req.query.orgId || req.headers['x-org-id'] || null;
    const driveType = req.query.driveType;
    const driveId = req.query.driveId;

    const payload = await fileManagerStoragePolicyService.getEffectivePolicy({
      userId: req.user._id,
      orgId,
      driveType,
      driveId,
    });

    return res.json(payload);
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: error.message });
    console.error('Error getting file manager storage policy:', error);
    return res.status(500).json({ error: 'Failed to get storage policy' });
  }
};
