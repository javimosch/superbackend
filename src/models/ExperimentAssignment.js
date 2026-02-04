const mongoose = require('mongoose');

const experimentAssignmentSchema = new mongoose.Schema(
  {
    experimentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Experiment', required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },

    subjectKey: { type: String, required: true },

    variantKey: { type: String, required: true },
    assignedAt: { type: Date, default: () => new Date() },

    context: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'experiment_assignments' },
);

experimentAssignmentSchema.index({ experimentId: 1, subjectKey: 1 }, { unique: true });
experimentAssignmentSchema.index({ organizationId: 1, subjectKey: 1 });

module.exports =
  mongoose.models.ExperimentAssignment ||
  mongoose.model('ExperimentAssignment', experimentAssignmentSchema);
