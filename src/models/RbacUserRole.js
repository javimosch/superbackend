const mongoose = require('mongoose');

const rbacUserRoleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RbacRole', required: true, index: true },
  },
  { timestamps: true, collection: 'rbac_user_roles' },
);

rbacUserRoleSchema.index({ userId: 1, roleId: 1 }, { unique: true });

module.exports = mongoose.models.RbacUserRole || mongoose.model('RbacUserRole', rbacUserRoleSchema);
