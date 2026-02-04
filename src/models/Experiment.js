const mongoose = require('mongoose');

const experimentVariantSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    weight: { type: Number, default: 0 },
    configSlug: { type: String, default: '' },
  },
  { _id: false },
);

const metricDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: ['count', 'sum', 'avg', 'rate'], default: 'count' },
    numeratorEventKey: { type: String, default: '' },
    denominatorEventKey: { type: String, default: '' },
    objective: { type: String, enum: ['maximize', 'minimize'], default: 'maximize' },
  },
  { _id: false },
);

const winnerPolicySchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['manual', 'automatic'], default: 'manual' },
    pickAfterMs: { type: Number, default: 0 },
    minAssignments: { type: Number, default: 0 },
    minExposures: { type: Number, default: 0 },
    minConversions: { type: Number, default: 0 },
    statMethod: { type: String, enum: ['simple_rate', 'bayesian_beta'], default: 'simple_rate' },
    overrideWinnerVariantKey: { type: String, default: '' },
  },
  { _id: false },
);

const experimentSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },

    code: { type: String, required: true },
    name: { type: String, default: '' },
    description: { type: String, default: '' },

    status: { type: String, enum: ['draft', 'running', 'paused', 'completed'], default: 'draft', index: true },

    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },

    assignment: {
      unit: { type: String, enum: ['subjectId'], default: 'subjectId' },
      sticky: { type: Boolean, default: true },
      salt: { type: String, default: '' },
    },

    variants: { type: [experimentVariantSchema], default: [] },

    primaryMetric: { type: metricDefinitionSchema, required: true },
    secondaryMetrics: { type: [metricDefinitionSchema], default: [] },

    winnerPolicy: { type: winnerPolicySchema, default: () => ({}) },

    winnerVariantKey: { type: String, default: '' },
    winnerDecidedAt: { type: Date, default: null },
    winnerReason: { type: String, default: '' },

    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'experiments' },
);

experimentSchema.index({ organizationId: 1, code: 1 }, { unique: true });
experimentSchema.index({ status: 1, startedAt: 1 });

module.exports = mongoose.models.Experiment || mongoose.model('Experiment', experimentSchema);
