const mongoose = require('mongoose');

const rbacGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
    isGlobal: { type: Boolean, default: true, index: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  { timestamps: true, collection: 'rbac_groups' },
);

rbacGroupSchema.index({ isGlobal: 1, orgId: 1, name: 1 });

module.exports = mongoose.models.RbacGroup || mongoose.model('RbacGroup', rbacGroupSchema);
