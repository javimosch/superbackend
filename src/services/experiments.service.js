const crypto = require('crypto');
const mongoose = require('mongoose');

const Experiment = require('../models/Experiment');
const ExperimentAssignment = require('../models/ExperimentAssignment');
const ExperimentEvent = require('../models/ExperimentEvent');

const cacheLayer = require('./cacheLayer.service');
const jsonConfigsService = require('./jsonConfigs.service');

function normalizeStr(v) {
  return String(v || '').trim();
}

function normalizeOrgId(orgId) {
  if (orgId === null || orgId === undefined || orgId === '') return null;
  const str = String(orgId);
  if (!mongoose.Types.ObjectId.isValid(str)) {
    const err = new Error('Invalid orgId');
    err.code = 'VALIDATION';
    throw err;
  }
  return new mongoose.Types.ObjectId(str);
}

function normalizeExperimentCode(code) {
  const c = normalizeStr(code);
  if (!c) {
    const err = new Error('experiment code is required');
    err.code = 'VALIDATION';
    throw err;
  }
  return c;
}

function normalizeSubjectId(subjectId) {
  const s = normalizeStr(subjectId);
  if (!s) {
    const err = new Error('subjectId is required');
    err.code = 'VALIDATION';
    throw err;
  }
  return s;
}

function computeSubjectKey({ orgId, subjectId }) {
  const sid = normalizeSubjectId(subjectId);
  const oid = orgId ? String(orgId) : 'global';
  return `org:${oid}:subject:${sid}`;
}

function computeBucketInt(input, max) {
  const hash = crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
  const int = parseInt(hash.slice(0, 8), 16);
  return max <= 0 ? 0 : int % max;
}

function pickWeightedVariant({ experiment, subjectKey }) {
  const variants = Array.isArray(experiment?.variants) ? experiment.variants : [];
  const eligible = variants
    .map((v) => ({
      key: normalizeStr(v?.key),
      weight: Number(v?.weight || 0) || 0,
      configSlug: normalizeStr(v?.configSlug),
    }))
    .filter((v) => v.key && v.weight > 0);

  if (!eligible.length) {
    const err = new Error('Experiment has no weighted variants');
    err.code = 'VALIDATION';
    throw err;
  }

  const total = eligible.reduce((acc, v) => acc + v.weight, 0);
  const salt = normalizeStr(experiment?.assignment?.salt) || String(experiment?._id || '');
  const pos = computeBucketInt(`${salt}:${subjectKey}`, total);

  let cursor = 0;
  for (const v of eligible) {
    cursor += v.weight;
    if (pos < cursor) return v;
  }

  return eligible[eligible.length - 1];
}

async function getExperimentByCode({ orgId, code }) {
  const c = normalizeExperimentCode(code);
  const oid = orgId ? normalizeOrgId(orgId) : null;

  const doc = await Experiment.findOne({ organizationId: oid, code: c }).lean();
  if (doc) return doc;

  if (oid) {
    const globalDoc = await Experiment.findOne({ organizationId: null, code: c }).lean();
    if (globalDoc) return globalDoc;
  }

  const err = new Error('Experiment not found');
  err.code = 'NOT_FOUND';
  throw err;
}

async function resolveVariantConfig(variant) {
  const slug = normalizeStr(variant?.configSlug);
  if (!slug) return null;
  return jsonConfigsService.getJsonConfigValueBySlug(slug);
}

async function getOrCreateAssignment({ orgId, experimentCode, subjectId, context }) {
  const exp = await getExperimentByCode({ orgId, code: experimentCode });
  const effectiveOrgId = exp.organizationId ? String(exp.organizationId) : null;
  const subjectKey = computeSubjectKey({ orgId: effectiveOrgId || orgId || null, subjectId });

  const cacheKey = `${String(exp._id)}:${subjectKey}`;
  const cached = await cacheLayer.get(cacheKey, { namespace: 'experiments.assignments' });
  if (cached && cached.variantKey) return { experiment: exp, assignment: cached };

  const existing = await ExperimentAssignment.findOne({ experimentId: exp._id, subjectKey }).lean();
  if (existing) {
    const assignment = {
      experimentId: String(existing.experimentId),
      organizationId: existing.organizationId ? String(existing.organizationId) : null,
      subjectKey: existing.subjectKey,
      variantKey: existing.variantKey,
      assignedAt: existing.assignedAt,
      context: existing.context || {},
    };
    await cacheLayer.set(cacheKey, assignment, { namespace: 'experiments.assignments', ttlSeconds: 60 });
    return { experiment: exp, assignment };
  }

  if (exp.status !== 'running' && exp.status !== 'completed') {
    const err = new Error('Experiment is not active');
    err.code = 'CONFLICT';
    throw err;
  }

  const picked = pickWeightedVariant({ experiment: exp, subjectKey });

  const created = await ExperimentAssignment.create({
    experimentId: exp._id,
    organizationId: exp.organizationId || null,
    subjectKey,
    variantKey: picked.key,
    assignedAt: new Date(),
    context: context && typeof context === 'object' ? context : {},
  });

  const assignment = {
    experimentId: String(created.experimentId),
    organizationId: created.organizationId ? String(created.organizationId) : null,
    subjectKey: created.subjectKey,
    variantKey: created.variantKey,
    assignedAt: created.assignedAt,
    context: created.context || {},
  };

  await cacheLayer.set(cacheKey, assignment, { namespace: 'experiments.assignments', ttlSeconds: 60 });
  return { experiment: exp, assignment };
}

async function ingestEvents({ orgId, experimentCode, subjectId, events }) {
  const exp = await getExperimentByCode({ orgId, code: experimentCode });

  const effectiveOrgId = exp.organizationId ? String(exp.organizationId) : null;
  const subjectKey = computeSubjectKey({ orgId: effectiveOrgId || orgId || null, subjectId });

  const list = Array.isArray(events) ? events : [];
  if (!list.length) {
    const err = new Error('events[] is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const variantKeys = new Set((exp.variants || []).map((v) => String(v?.key || '').trim()).filter(Boolean));

  const now = new Date();
  const docs = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;

    const eventKey = normalizeStr(e.eventKey);
    if (!eventKey) {
      const err = new Error('eventKey is required');
      err.code = 'VALIDATION';
      throw err;
    }

    const ts = e.ts ? new Date(e.ts) : now;
    if (!Number.isFinite(ts.getTime())) {
      const err = new Error('Invalid ts');
      err.code = 'VALIDATION';
      throw err;
    }

    let variantKey = normalizeStr(e.variantKey);
    if (!variantKey) {
      const { assignment } = await getOrCreateAssignment({ orgId, experimentCode, subjectId, context: null });
      variantKey = assignment.variantKey;
    }

    if (!variantKeys.has(variantKey)) {
      const err = new Error('Invalid variantKey');
      err.code = 'VALIDATION';
      throw err;
    }

    const value = e.value === undefined ? 1 : Number(e.value);
    if (!Number.isFinite(value)) {
      const err = new Error('Invalid value');
      err.code = 'VALIDATION';
      throw err;
    }

    docs.push({
      experimentId: exp._id,
      organizationId: exp.organizationId || null,
      subjectKey,
      variantKey,
      eventKey,
      value,
      ts,
      meta: e.meta && typeof e.meta === 'object' ? e.meta : {},
    });
  }

  if (!docs.length) {
    const err = new Error('No valid events provided');
    err.code = 'VALIDATION';
    throw err;
  }

  const inserted = await ExperimentEvent.insertMany(docs, { ordered: false });
  return { insertedCount: Array.isArray(inserted) ? inserted.length : 0 };
}

async function getWinnerSnapshot({ orgId, experimentCode }) {
  const exp = await getExperimentByCode({ orgId, code: experimentCode });

  const cacheKey = String(exp._id);
  const cached = await cacheLayer.get(cacheKey, { namespace: 'experiments.winner' });
  if (cached && typeof cached === 'object') return { experiment: exp, snapshot: cached };

  const snapshot = {
    experimentId: String(exp._id),
    organizationId: exp.organizationId ? String(exp.organizationId) : null,
    code: exp.code,
    status: exp.status,
    winnerVariantKey: exp.winnerVariantKey || null,
    winnerDecidedAt: exp.winnerDecidedAt || null,
    winnerReason: exp.winnerReason || null,
  };

  await cacheLayer.set(cacheKey, snapshot, { namespace: 'experiments.winner', ttlSeconds: 30 });
  return { experiment: exp, snapshot };
}

async function clearExperimentCaches(experimentId) {
  const id = String(experimentId || '').trim();
  if (!id) return;
  await cacheLayer.delete(id, { namespace: 'experiments.winner' }).catch(() => {});
}

module.exports = {
  computeSubjectKey,
  getExperimentByCode,
  resolveVariantConfig,
  getOrCreateAssignment,
  ingestEvents,
  getWinnerSnapshot,
  clearExperimentCaches,
};
