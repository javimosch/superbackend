const experimentsAggregation = require('../services/experimentsAggregation.service');
const experimentsRetention = require('../services/experimentsRetention.service');

exports.runAggregation = async (req, res) => {
  try {
    const body = req.body || {};
    const bucketMs = body.bucketMs;
    const start = body.start;
    const end = body.end;
    const data = await experimentsAggregation.runAggregationAndWinner({ bucketMs, start, end });
    return res.json(data);
  } catch (error) {
    console.error('[InternalExperiments] runAggregation error:', error);
    return res.status(500).json({ error: error.message || 'Aggregation failed' });
  }
};

exports.runRetention = async (_req, res) => {
  try {
    const data = await experimentsRetention.runRetentionCleanup();
    return res.json(data);
  } catch (error) {
    console.error('[InternalExperiments] runRetention error:', error);
    return res.status(500).json({ error: error.message || 'Retention cleanup failed' });
  }
};
