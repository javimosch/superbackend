const mongoose = require('mongoose');

const Experiment = require('../models/Experiment');
const ExperimentEvent = require('../models/ExperimentEvent');
const ExperimentMetricBucket = require('../models/ExperimentMetricBucket');

const experimentsService = require('./experiments.service');
const { broadcastWinnerChanged } = require('./experimentsWs.service');
const webhookService = require('./webhook.service');

function normalizeStr(v) {
  return String(v || '').trim();
}

function floorToBucket(date, bucketMs) {
  const t = new Date(date).getTime();
  const ms = Number(bucketMs || 0) || 0;
  if (!Number.isFinite(t) || ms <= 0) return null;
  return new Date(Math.floor(t / ms) * ms);
}

function resolveMetricKeys(exp) {
  const defs = [];
  if (exp?.primaryMetric) defs.push(exp.primaryMetric);
  for (const m of exp?.secondaryMetrics || []) defs.push(m);

  const keys = new Set();
  for (const d of defs) {
    const kind = normalizeStr(d?.kind);
    const key = normalizeStr(d?.key);
    if (!key) continue;

    if (kind === 'rate') {
      const num = normalizeStr(d?.numeratorEventKey);
      const den = normalizeStr(d?.denominatorEventKey);
      if (num) keys.add(num);
      if (den) keys.add(den);
      continue;
    }

    keys.add(key);
  }
  return Array.from(keys);
}

async function aggregateExperiment({ experimentId, bucketMs, start, end }) {
  const exp = await Experiment.findById(experimentId).lean();
  if (!exp) {
    const err = new Error('Experiment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const metricEventKeys = resolveMetricKeys(exp);
  if (!metricEventKeys.length) {
    return { experimentId: String(exp._id), aggregated: 0 };
  }

  const startAt = start ? new Date(start) : (exp.startedAt ? new Date(exp.startedAt) : new Date(Date.now() - 24 * 60 * 60 * 1000));
  const endAt = end ? new Date(end) : new Date();

  const bucket = Number(bucketMs || 0) || 3600000;

  const pipeline = [
    {
      $match: {
        experimentId: new mongoose.Types.ObjectId(String(exp._id)),
        ts: { $gte: startAt, $lte: endAt },
        eventKey: { $in: metricEventKeys },
      },
    },
    {
      $addFields: {
        bucketStart: {
          $toDate: {
            $multiply: [
              { $floor: { $divide: [{ $toLong: '$ts' }, bucket] } },
              bucket,
            ],
          },
        },
      },
    },
    {
      $group: {
        _id: {
          variantKey: '$variantKey',
          metricKey: '$eventKey',
          bucketStart: '$bucketStart',
        },
        count: { $sum: 1 },
        sum: { $sum: '$value' },
        sumSq: { $sum: { $multiply: ['$value', '$value'] } },
        min: { $min: '$value' },
        max: { $max: '$value' },
      },
    },
  ];

  const rows = await ExperimentEvent.aggregate(pipeline);

  let aggregated = 0;
  for (const r of rows || []) {
    if (!r || !r._id) continue;

    await ExperimentMetricBucket.updateOne(
      {
        experimentId: exp._id,
        organizationId: exp.organizationId || null,
        variantKey: String(r._id.variantKey),
        metricKey: String(r._id.metricKey),
        bucketStart: new Date(r._id.bucketStart),
        bucketMs: bucket,
      },
      {
        $set: {
          count: Number(r.count || 0) || 0,
          sum: Number(r.sum || 0) || 0,
          sumSq: Number(r.sumSq || 0) || 0,
          min: r.min === undefined ? null : r.min,
          max: r.max === undefined ? null : r.max,
        },
      },
      { upsert: true },
    );

    aggregated += 1;
  }

  return { experimentId: String(exp._id), aggregated };
}

async function computeTotalsForMetric({ experimentId, variantKey, metricKey, startAt }) {
  const q = {
    experimentId: new mongoose.Types.ObjectId(String(experimentId)),
    variantKey: String(variantKey),
    metricKey: String(metricKey),
  };

  if (startAt) {
    q.bucketStart = { $gte: new Date(startAt) };
  }

  const rows = await ExperimentMetricBucket.find(q).select('count sum').lean();

  let count = 0;
  let sum = 0;
  for (const r of rows || []) {
    count += Number(r.count || 0) || 0;
    sum += Number(r.sum || 0) || 0;
  }

  return { count, sum };
}

async function evaluateWinner({ experimentId }) {
  const exp = await Experiment.findById(experimentId);
  if (!exp) {
    const err = new Error('Experiment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (exp.winnerPolicy?.mode !== 'automatic') {
    return { decided: false, reason: 'manual_mode' };
  }

  if (exp.winnerVariantKey && exp.winnerDecidedAt) {
    return { decided: true, reason: 'already_decided', winnerVariantKey: exp.winnerVariantKey };
  }

  const pickAfterMs = Number(exp.winnerPolicy?.pickAfterMs || 0) || 0;
  const startedAt = exp.startedAt ? new Date(exp.startedAt) : null;
  if (!startedAt) {
    return { decided: false, reason: 'missing_startedAt' };
  }

  if (pickAfterMs > 0 && Date.now() - startedAt.getTime() < pickAfterMs) {
    return { decided: false, reason: 'too_early' };
  }

  const primary = exp.primaryMetric || {};
  const kind = normalizeStr(primary.kind) || 'count';

  const variants = (exp.variants || []).map((v) => normalizeStr(v?.key)).filter(Boolean);
  if (!variants.length) {
    return { decided: false, reason: 'no_variants' };
  }

  const evalStart = startedAt;

  const scores = [];
  for (const variantKey of variants) {
    if (kind === 'rate') {
      const numeratorKey = normalizeStr(primary.numeratorEventKey);
      const denominatorKey = normalizeStr(primary.denominatorEventKey);

      if (!numeratorKey || !denominatorKey) {
        return { decided: false, reason: 'invalid_primary_rate_metric' };
      }

      const num = await computeTotalsForMetric({ experimentId: exp._id, variantKey, metricKey: numeratorKey, startAt: evalStart });
      const den = await computeTotalsForMetric({ experimentId: exp._id, variantKey, metricKey: denominatorKey, startAt: evalStart });

      const conversions = num.sum;
      const exposures = den.sum;

      const score = exposures > 0 ? conversions / exposures : 0;
      scores.push({ variantKey, score, conversions, exposures });
      continue;
    }

    const metricKey = normalizeStr(primary.key);
    if (!metricKey) {
      return { decided: false, reason: 'invalid_primary_metric' };
    }

    const totals = await computeTotalsForMetric({ experimentId: exp._id, variantKey, metricKey, startAt: evalStart });

    let score = 0;
    if (kind === 'count') score = totals.count;
    else if (kind === 'sum') score = totals.sum;
    else if (kind === 'avg') score = totals.count > 0 ? totals.sum / totals.count : 0;
    else score = totals.sum;

    scores.push({ variantKey, score, count: totals.count, sum: totals.sum });
  }

  const minAssignments = Number(exp.winnerPolicy?.minAssignments || 0) || 0;
  const minExposures = Number(exp.winnerPolicy?.minExposures || 0) || 0;
  const minConversions = Number(exp.winnerPolicy?.minConversions || 0) || 0;

  if (kind === 'rate') {
    const anyOk = scores.some((s) => (Number(s.exposures || 0) || 0) >= minExposures && (Number(s.conversions || 0) || 0) >= minConversions);
    if (!anyOk) return { decided: false, reason: 'insufficient_data' };
  }

  if (minAssignments > 0) {
    // Placeholder: assignment counts could be derived from assignments collection.
    // We enforce it later once we implement an efficient counter.
  }

  const objective = normalizeStr(primary.objective) || 'maximize';
  const sorted = [...scores].sort((a, b) => (objective === 'minimize' ? a.score - b.score : b.score - a.score));
  const winner = sorted[0];
  if (!winner) return { decided: false, reason: 'no_scores' };

  const override = normalizeStr(exp.winnerPolicy?.overrideWinnerVariantKey);
  const winnerKey = override || winner.variantKey;

  exp.winnerVariantKey = winnerKey;
  exp.winnerDecidedAt = new Date();
  exp.winnerReason = override ? 'manual_override' : `auto:${kind}:${objective}`;
  exp.status = 'completed';

  await exp.save();

  await experimentsService.clearExperimentCaches(exp._id);

  broadcastWinnerChanged({
    experimentId: String(exp._id),
    experimentCode: exp.code,
    organizationId: exp.organizationId ? String(exp.organizationId) : null,
    winnerVariantKey: exp.winnerVariantKey,
    decidedAt: exp.winnerDecidedAt,
  });

  if (exp.organizationId) {
    webhookService.emit(
      'experiment.winner_changed',
      {
        experimentId: String(exp._id),
        code: exp.code,
        winnerVariantKey: exp.winnerVariantKey,
        decidedAt: exp.winnerDecidedAt,
      },
      String(exp.organizationId),
    );
  }

  return { decided: true, reason: exp.winnerReason, winnerVariantKey: exp.winnerVariantKey, scores };
}

async function runAggregationAndWinner({ bucketMs, start, end } = {}) {
  const now = new Date();
  const bucket = Number(bucketMs || 0) || 3600000;

  const startAt = start ? new Date(start) : new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const endAt = end ? new Date(end) : now;

  const experiments = await Experiment.find({ status: { $in: ['running', 'completed'] } }).select('_id').lean();

  const out = [];
  for (const e of experiments || []) {
    const res = await aggregateExperiment({ experimentId: e._id, bucketMs: bucket, start: startAt, end: endAt });
    const win = await evaluateWinner({ experimentId: e._id }).catch((err) => ({ decided: false, reason: err.message }));
    out.push({ experimentId: String(e._id), aggregated: res.aggregated, winner: win });
  }

  return { range: { start: startAt.toISOString(), end: endAt.toISOString() }, bucketMs: bucket, items: out };
}

module.exports = {
  floorToBucket,
  aggregateExperiment,
  evaluateWinner,
  runAggregationAndWinner,
};
