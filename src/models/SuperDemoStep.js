const mongoose = require('mongoose');

const superDemoStepSchema = new mongoose.Schema(
  {
    demoId: { type: String, required: true, index: true, trim: true },
    order: { type: Number, required: true, index: true },

    selector: { type: String, required: true },
    selectorHints: { type: mongoose.Schema.Types.Mixed, default: null },

    message: { type: String, required: true },
    placement: {
      type: String,
      enum: ['top', 'bottom', 'left', 'right', 'auto'],
      default: 'auto',
    },

    waitFor: { type: mongoose.Schema.Types.Mixed, default: null },
    advance: { type: mongoose.Schema.Types.Mixed, default: { type: 'manualNext' } },
  },
  { timestamps: true, collection: 'super_demo_steps' },
);

superDemoStepSchema.index({ demoId: 1, order: 1 }, { unique: true });

module.exports = mongoose.models.SuperDemoStep ||
  mongoose.model('SuperDemoStep', superDemoStepSchema);
