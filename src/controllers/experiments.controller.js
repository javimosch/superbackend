const experimentsService = require('../services/experiments.service');

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'CONFLICT') return { status: 409, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

exports.getAssignment = async (req, res) => {
  try {
    const orgId = req.headers['x-org-id'] || req.query.orgId || req.body?.orgId;
    const subjectId = req.query.subjectId || req.body?.subjectId;

    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};

    const { experiment, assignment } = await experimentsService.getOrCreateAssignment({
      orgId,
      experimentCode: req.params.code,
      subjectId,
      context,
    });

    const variant = (experiment.variants || []).find((v) => String(v?.key || '') === String(assignment.variantKey));
    const config = await experimentsService.resolveVariantConfig(variant);

    const { snapshot } = await experimentsService.getWinnerSnapshot({ orgId, experimentCode: req.params.code });

    return res.json({
      experimentCode: experiment.code,
      variantKey: assignment.variantKey,
      assignedAt: assignment.assignedAt,
      config,
      winner: {
        winnerVariantKey: snapshot.winnerVariantKey,
        decidedAt: snapshot.winnerDecidedAt,
        reason: snapshot.winnerReason,
        status: snapshot.status,
      },
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.postEvents = async (req, res) => {
  try {
    const orgId = req.headers['x-org-id'] || req.query.orgId || req.body?.orgId;
    const subjectId = req.query.subjectId || req.body?.subjectId;

    const payload = req.body || {};
    const events = Array.isArray(payload.events) ? payload.events : [payload];

    const result = await experimentsService.ingestEvents({
      orgId,
      experimentCode: req.params.code,
      subjectId,
      events,
    });

    return res.status(201).json(result);
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.getWinner = async (req, res) => {
  try {
    const orgId = req.headers['x-org-id'] || req.query.orgId || req.body?.orgId;
    const { snapshot } = await experimentsService.getWinnerSnapshot({ orgId, experimentCode: req.params.code });
    return res.json({
      status: snapshot.status,
      winnerVariantKey: snapshot.winnerVariantKey,
      decidedAt: snapshot.winnerDecidedAt,
      reason: snapshot.winnerReason,
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};
