const mongoose = require('mongoose');

const rbacGrantSchema = new mongoose.Schema(
  {
    subjectType: { type: String, enum: ['user', 'role', 'group', 'org'], required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    scopeType: { type: String, enum: ['global', 'org'], required: true, index: true },
    scopeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },

    right: { type: String, required: true, trim: true, index: true },
    effect: { type: String, enum: ['allow', 'deny'], default: 'allow', index: true },

    createdByActorType: { type: String, default: null },
    createdByActorId: { type: String, default: null },
  },
  { timestamps: true, collection: 'rbac_grants' },
);

rbacGrantSchema.index(
  { subjectType: 1, subjectId: 1, scopeType: 1, scopeId: 1, right: 1 },
  { unique: true },
);

module.exports = mongoose.models.RbacGrant || mongoose.model('RbacGrant', rbacGrantSchema);
