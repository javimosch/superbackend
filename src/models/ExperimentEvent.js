const mongoose = require('mongoose');

const experimentEventSchema = new mongoose.Schema(
  {
    experimentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Experiment', required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },

    subjectKey: { type: String, required: true },

    variantKey: { type: String, required: true, index: true },

    eventKey: { type: String, required: true, index: true },
    value: { type: Number, default: 1 },

    ts: { type: Date, required: true, index: true },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'experiment_events' },
);

experimentEventSchema.index({ experimentId: 1, ts: 1 });
experimentEventSchema.index({ organizationId: 1, ts: 1 });
experimentEventSchema.index({ experimentId: 1, eventKey: 1, ts: 1 });

module.exports = mongoose.models.ExperimentEvent || mongoose.model('ExperimentEvent', experimentEventSchema);
