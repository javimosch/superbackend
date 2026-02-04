const experimentsAggregation = require('../services/experimentsAggregation.service');
const experimentsRetention = require('../services/experimentsRetention.service');

exports.runAggregation = async (req, res) => {
  const body = req.body || {};
  const bucketMs = body.bucketMs;
  const start = body.start;
  const end = body.end;

  const data = await experimentsAggregation.runAggregationAndWinner({ bucketMs, start, end });
  return res.json(data);
};

exports.runRetention = async (_req, res) => {
  const data = await experimentsRetention.runRetentionCleanup();
  return res.json(data);
};
