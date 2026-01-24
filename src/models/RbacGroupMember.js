const mongoose = require('mongoose');

const rbacGroupMemberSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'RbacGroup', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true, collection: 'rbac_group_members' },
);

rbacGroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.RbacGroupMember || mongoose.model('RbacGroupMember', rbacGroupMemberSchema);
