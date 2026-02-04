const mongoose = require('mongoose');

const Experiment = require('../models/Experiment');
const ExperimentMetricBucket = require('../models/ExperimentMetricBucket');

const experimentsService = require('../services/experiments.service');

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'CONFLICT') return { status: 409, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function isValidObjectId(id) {
  return id && mongoose.Types.ObjectId.isValid(String(id));
}

function normalizeVariant(v) {
  const key = String(v?.key || '').trim();
  const weight = Number(v?.weight || 0) || 0;
  const configSlug = String(v?.configSlug || '').trim();
  if (!key) return null;
  return { key, weight, configSlug };
}

function normalizeMetric(d) {
  const key = String(d?.key || '').trim();
  const kind = String(d?.kind || '').trim() || 'count';
  if (!key) return null;
  return {
    key,
    kind,
    numeratorEventKey: String(d?.numeratorEventKey || '').trim(),
    denominatorEventKey: String(d?.denominatorEventKey || '').trim(),
    objective: String(d?.objective || 'maximize').trim() === 'minimize' ? 'minimize' : 'maximize',
  };
}

exports.list = async (req, res) => {
  try {
    const orgId = req.query.orgId || null;
    const q = {};
    if (orgId) q.organizationId = orgId;

    const items = await Experiment.find(q).sort({ updatedAt: -1 }).lean();
    return res.json({ items });
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.get = async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Experiment.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json({ item: doc });
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.create = async (req, res) => {
  try {
    const p = req.body || {};

    const orgId = p.organizationId === null || p.organizationId === '' ? null : p.organizationId;
    if (orgId && !isValidObjectId(orgId)) {
      return res.status(400).json({ error: 'Invalid organizationId' });
    }

    const code = String(p.code || '').trim();
    if (!code) return res.status(400).json({ error: 'code is required' });

    const variants = (Array.isArray(p.variants) ? p.variants : []).map(normalizeVariant).filter(Boolean);
    const primaryMetric = normalizeMetric(p.primaryMetric);
    if (!primaryMetric) return res.status(400).json({ error: 'primaryMetric is required' });

    const doc = await Experiment.create({
      organizationId: orgId || null,
      code,
      name: String(p.name || '').trim(),
      description: String(p.description || '').trim(),
      status: String(p.status || 'draft'),
      startedAt: p.startedAt ? new Date(p.startedAt) : null,
      endsAt: p.endsAt ? new Date(p.endsAt) : null,
      assignment: { unit: 'subjectId', sticky: p.assignment?.sticky !== false, salt: String(p.assignment?.salt || '').trim() },
      variants,
      primaryMetric,
      secondaryMetrics: (Array.isArray(p.secondaryMetrics) ? p.secondaryMetrics : []).map(normalizeMetric).filter(Boolean),
      winnerPolicy: {
        mode: String(p.winnerPolicy?.mode || 'manual') === 'automatic' ? 'automatic' : 'manual',
        pickAfterMs: Number(p.winnerPolicy?.pickAfterMs || 0) || 0,
        minAssignments: Number(p.winnerPolicy?.minAssignments || 0) || 0,
        minExposures: Number(p.winnerPolicy?.minExposures || 0) || 0,
        minConversions: Number(p.winnerPolicy?.minConversions || 0) || 0,
        statMethod: String(p.winnerPolicy?.statMethod || 'simple_rate'),
        overrideWinnerVariantKey: String(p.winnerPolicy?.overrideWinnerVariantKey || '').trim(),
      },
      createdByUserId: req.user?._id || null,
      updatedByUserId: req.user?._id || null,
    });

    await experimentsService.clearExperimentCaches(doc._id);

    return res.status(201).json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.update = async (req, res) => {
  try {
    const id = req.params.id;
    const p = req.body || {};

    const doc = await Experiment.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (p.name !== undefined) doc.name = String(p.name || '').trim();
    if (p.description !== undefined) doc.description = String(p.description || '').trim();
    if (p.status !== undefined) doc.status = String(p.status);
    if (p.startedAt !== undefined) doc.startedAt = p.startedAt ? new Date(p.startedAt) : null;
    if (p.endsAt !== undefined) doc.endsAt = p.endsAt ? new Date(p.endsAt) : null;

    if (p.variants !== undefined) {
      doc.variants = (Array.isArray(p.variants) ? p.variants : []).map(normalizeVariant).filter(Boolean);
    }

    if (p.primaryMetric !== undefined) {
      const m = normalizeMetric(p.primaryMetric);
      if (!m) return res.status(400).json({ error: 'primaryMetric is required' });
      doc.primaryMetric = m;
    }

    if (p.secondaryMetrics !== undefined) {
      doc.secondaryMetrics = (Array.isArray(p.secondaryMetrics) ? p.secondaryMetrics : []).map(normalizeMetric).filter(Boolean);
    }

    if (p.winnerPolicy !== undefined) {
      doc.winnerPolicy = {
        ...(doc.winnerPolicy?.toObject ? doc.winnerPolicy.toObject() : doc.winnerPolicy),
        ...(p.winnerPolicy || {}),
      };
    }

    doc.updatedByUserId = req.user?._id || null;

    await doc.save();
    await experimentsService.clearExperimentCaches(doc._id);

    return res.json({ item: doc.toObject() });
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.remove = async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Experiment.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    await doc.deleteOne();
    await experimentsService.clearExperimentCaches(id);

    return res.json({ success: true });
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};

exports.getMetrics = async (req, res) => {
  try {
    const experimentId = req.params.id;
    const start = req.query.start ? new Date(req.query.start) : null;
    const end = req.query.end ? new Date(req.query.end) : null;

    const q = { experimentId };
    if (start || end) {
      q.bucketStart = {};
      if (start) q.bucketStart.$gte = start;
      if (end) q.bucketStart.$lte = end;
    }

    const buckets = await ExperimentMetricBucket.find(q).sort({ bucketStart: 1 }).lean();
    return res.json({ buckets });
  } catch (err) {
    const safe = toSafeJsonError(err);
    return res.status(safe.status).json(safe.body);
  }
};
