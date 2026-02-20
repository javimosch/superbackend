const dataCleanup = require('../services/dataCleanup.service');

exports.getOverview = async (req, res) => {
  try {
    const data = await dataCleanup.getOverviewStats();
    return res.json(data);
  } catch (err) {
    const safe = dataCleanup.toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.dryRun = async (req, res) => {
  try {
    const out = await dataCleanup.dryRunCollectionCleanup(req.body || {});
    return res.json(out);
  } catch (err) {
    const safe = dataCleanup.toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.execute = async (req, res) => {
  try {
    const out = await dataCleanup.executeCollectionCleanup(req.body || {});
    return res.json(out);
  } catch (err) {
    const safe = dataCleanup.toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.inferFields = async (req, res) => {
  try {
    const { collection } = req.query;
    if (!collection) {
      return res.status(400).json({ error: 'collection query parameter is required' });
    }
    const fields = await dataCleanup.inferCollectionFields(collection);
    return res.json({ fields });
  } catch (err) {
    const safe = dataCleanup.toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};
