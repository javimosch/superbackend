#!/usr/bin/env node

/**
 * RBAC Advanced: user-permissions, grant-role, revoke-role, group-members, add-to-group, remove-from-group
 */

const mongoose = require('mongoose');

const userPermissions = {
  async execute(options) {
    const User = mongoose.model('User');
    const RbacUserRole = mongoose.model('RbacUserRole');
    const RbacRole = mongoose.model('RbacRole');

    const userId = options.key;
    if (!userId) throw new Error('--key (user ID) is required');

    const user = await User.findById(userId).lean();
    if (!user) return { error: 'User not found' };

    const userRoles = await RbacUserRole.find({ userId }).populate('roleId').lean();
    const roles = userRoles.map(ur => ur.roleId);

    return { userId, email: user.email, role: user.role, rbacRoles: roles.map(r => ({ name: r.name, description: r.description })) };
  },
};

const grantRole = {
  async execute(options) {
    const RbacUserRole = mongoose.model('RbacUserRole');
    const RbacRole = mongoose.model('RbacRole');

    const userId = options.key;
    const roleName = options.value;

    if (!userId) throw new Error('--key (user ID) is required');
    if (!roleName) throw new Error('--value (role name) is required');

    const role = await RbacRole.findOne({ name: roleName });
    if (!role) throw new Error(`Role '${roleName}' not found`);

    const existing = await RbacUserRole.findOne({ userId, roleId: role._id });
    if (existing) return { message: 'User already has this role', userId, roleId: role._id };

    await RbacUserRole.create({ userId, roleId: role._id });
    return { success: true, userId, roleId: role._id, roleName };
  },
};

const revokeRole = {
  async execute(options) {
    const RbacUserRole = mongoose.model('RbacUserRole');
    const RbacRole = mongoose.model('RbacRole');

    const userId = options.key;
    const roleName = options.value;

    if (!userId) throw new Error('--key (user ID) is required');
    if (!roleName) throw new Error('--value (role name) is required');

    const role = await RbacRole.findOne({ name: roleName });
    if (!role) throw new Error(`Role '${roleName}' not found`);

    const result = await RbacUserRole.deleteOne({ userId, roleId: role._id });
    return { success: result.deletedCount > 0, userId, roleId: role._id, roleName };
  },
};

const groupMembers = {
  async execute(options) {
    const RbacGroup = mongoose.model('RbacGroup');
    const RbacGroupMember = mongoose.model('RbacGroupMember');

    const groupId = options.key;

    if (!groupId) {
      const groups = await RbacGroup.find().lean();
      const result = [];
      for (const group of groups) {
        const members = await RbacGroupMember.find({ groupId }).populate('userId').lean();
        result.push({
          groupId: group._id,
          name: group.name,
          memberCount: members.length,
          members: members.map(m => ({ userId: m.userId?._id, email: m.userId?.email })),
        });
      }
      return { groups: result };
    }

    const group = await RbacGroup.findById(groupId).lean();
    if (!group) throw new Error('Group not found');

    const members = await RbacGroupMember.find({ groupId }).populate('userId').lean();
    return { groupId, name: group.name, members: members.map(m => ({ userId: m.userId?._id, email: m.userId?.email })) };
  },
};

const addToGroup = {
  async execute(options) {
    const RbacGroupMember = mongoose.model('RbacGroupMember');

    const groupId = options.key;
    const userId = options.value;

    if (!groupId) throw new Error('--key (group ID) is required');
    if (!userId) throw new Error('--value (user ID) is required');

    const existing = await RbacGroupMember.findOne({ groupId, userId });
    if (existing) return { message: 'User already in group', groupId, userId };

    await RbacGroupMember.create({ groupId, userId });
    return { success: true, groupId, userId };
  },
};

const removeFromGroup = {
  async execute(options) {
    const RbacGroupMember = mongoose.model('RbacGroupMember');

    const groupId = options.key;
    const userId = options.value;

    if (!groupId) throw new Error('--key (group ID) is required');
    if (!userId) throw new Error('--value (user ID) is required');

    const result = await RbacGroupMember.deleteOne({ groupId, userId });
    return { success: result.deletedCount > 0, groupId, userId };
  },
};

module.exports = { userPermissions, grantRole, revokeRole, groupMembers, addToGroup, removeFromGroup };
