const mongoose = require('mongoose');

const superDemoSchema = new mongoose.Schema(
  {
    demoId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      match: [/^demo_[a-z0-9]{8,32}$/, 'Invalid demoId'],
    },
    projectId: { type: String, required: true, index: true, trim: true },

    name: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },

    publishedVersion: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },

    // Minimal targeting for v1.
    // Interpreted as a substring match against window.location.href unless otherwise specified.
    startUrlPattern: { type: String, default: null },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'super_demos' },
);

superDemoSchema.index({ projectId: 1, status: 1, isActive: 1 });

module.exports = mongoose.models.SuperDemo || mongoose.model('SuperDemo', superDemoSchema);
