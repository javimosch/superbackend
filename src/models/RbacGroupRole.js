const mongoose = require('mongoose');

const rbacGroupRoleSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'RbacGroup', required: true, index: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RbacRole', required: true, index: true },
  },
  { timestamps: true, collection: 'rbac_group_roles' },
);

rbacGroupRoleSchema.index({ groupId: 1, roleId: 1 }, { unique: true });

module.exports = mongoose.models.RbacGroupRole || mongoose.model('RbacGroupRole', rbacGroupRoleSchema);
