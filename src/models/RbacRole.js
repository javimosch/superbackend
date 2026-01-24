const mongoose = require('mongoose');

const rbacRoleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
    isGlobal: { type: Boolean, default: true, index: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  { timestamps: true, collection: 'rbac_roles' },
);

rbacRoleSchema.index({ isGlobal: 1, orgId: 1, key: 1 });
rbacRoleSchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { isGlobal: true } },
);
rbacRoleSchema.index(
  { orgId: 1, key: 1 },
  { unique: true, partialFilterExpression: { isGlobal: false } },
);

module.exports = mongoose.models.RbacRole || mongoose.model('RbacRole', rbacRoleSchema);
