const mongoose = require('mongoose');

const User = require('../models/User');
const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const RbacRole = require('../models/RbacRole');
const RbacUserRole = require('../models/RbacUserRole');
const RbacGroup = require('../models/RbacGroup');
const RbacGroupMember = require('../models/RbacGroupMember');
const RbacGroupRole = require('../models/RbacGroupRole');
const RbacGrant = require('../models/RbacGrant');
const rbacService = require('../services/rbac.service');
const { listRights } = require('../utils/rbac/rightsRegistry');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');

function isValidObjectId(id) {
  return id && mongoose.Types.ObjectId.isValid(String(id));
}

function parseLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, parsed));
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.listRights = async (req, res) => {
  return res.json({ rights: listRights() });
};

exports.searchUsers = async (req, res) => {
  const { q, limit, orgId } = req.query;
  const l = parseLimit(limit);

  if (orgId !== undefined && orgId !== null && String(orgId).trim()) {
    if (!isValidObjectId(orgId)) {
      return res.status(400).json({ error: 'Invalid orgId' });
    }

    const pattern = q ? escapeRegex(String(q).trim()) : null;

    const pipeline = [
      { $match: { orgId: new mongoose.Types.ObjectId(String(orgId)), status: 'active' } },
      {
        $lookup: {
          from: 'users',
          let: { uid: '$userId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$uid'] } } },
            ...(pattern
              ? [
                  {
                    $match: {
                      $or: [
                        { email: { $regex: pattern, $options: 'i' } },
                        { name: { $regex: pattern, $options: 'i' } },
                      ],
                    },
                  },
                ]
              : []),
            { $project: { email: 1, name: 1, role: 1, createdAt: 1 } },
          ],
          as: 'user',
        },
      },
      { $unwind: '$user' },
      { $sort: { 'user.createdAt': -1 } },
      { $limit: l },
      { $project: { _id: 0, user: 1 } },
    ];

    const rows = await OrganizationMember.aggregate(pipeline);
    const users = rows.map((r) => r.user).filter(Boolean);

    return res.json({
      users: users.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name || '',
        role: u.role,
      })),
    });
  }

  const query = {};
  if (q) {
    const pattern = escapeRegex(String(q).trim());
    query.$or = [
      { email: { $regex: pattern, $options: 'i' } },
      { name: { $regex: pattern, $options: 'i' } },
    ];
  }

  const users = await User.find(query)
    .select('email name role createdAt')
    .sort({ createdAt: -1 })
    .limit(l)
    .lean();

  return res.json({
    users: users.map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name || '',
      role: u.role,
    })),
  });
};

exports.getUserOrgs = async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const rows = await OrganizationMember.find({ userId, status: 'active' }).select('orgId').lean();
  const orgIds = rows.map((r) => r.orgId);

  const orgs = await Organization.find({ _id: { $in: orgIds }, status: 'active' })
    .select('name slug')
    .sort({ name: 1 })
    .lean();

  return res.json({
    orgs: orgs.map((o) => ({ id: String(o._id), name: o.name, slug: o.slug })),
  });
};

exports.testRight = async (req, res) => {
  const { userId, orgId, right } = req.body || {};
  if (!isValidObjectId(userId) || !isValidObjectId(orgId)) {
    return res.status(400).json({ error: 'userId and orgId are required (ObjectId)' });
  }
  if (!right || typeof right !== 'string') {
    return res.status(400).json({ error: 'right is required' });
  }

  const result = await rbacService.checkRight({ userId, orgId, right });
  return res.json({
    allowed: result.allowed,
    reason: result.reason,
    decisionLayer: result.decisionLayer || null,
    explain: result.explain || [],
    context: result.context || null,
  });
};

exports.listRoles = async (req, res) => {
  const roles = await RbacRole.find({}).sort({ createdAt: -1 }).lean();
  return res.json({
    roles: roles.map((r) => ({
      ...r,
      id: String(r._id),
      orgId: r.orgId ? String(r.orgId) : null,
    })),
  });
};

exports.createRole = async (req, res) => {
  const { key, name, description, status, isGlobal, orgId } = req.body || {};
  if (!key || !name) {
    return res.status(400).json({ error: 'key and name are required' });
  }

  const globalFlag = isGlobal !== false;
  if (!globalFlag && !isValidObjectId(orgId)) {
    return res.status(400).json({ error: 'orgId is required for org-scoped roles' });
  }

  const actor = getBasicAuthActor(req);

  const role = await RbacRole.create({
    key: String(key).trim().toLowerCase(),
    name: String(name).trim(),
    description: String(description || '').trim(),
    status: status === 'disabled' ? 'disabled' : 'active',
    isGlobal: globalFlag,
    orgId: globalFlag ? null : orgId,
  });

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.role.create',
    entityType: 'RbacRole',
    entityId: String(role._id),
    before: null,
    after: role.toJSON ? role.toJSON() : role,
    meta: null,
  });

  return res.status(201).json({ role: { ...role.toObject(), id: String(role._id) } });
};

exports.updateRole = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid role id' });
  }

  const role = await RbacRole.findById(id);
  if (!role) {
    return res.status(404).json({ error: 'Role not found' });
  }

  const before = role.toObject();
  const actor = getBasicAuthActor(req);

  const { name, description, status, isGlobal, orgId } = req.body || {};
  if (name !== undefined) role.name = String(name).trim();
  if (description !== undefined) role.description = String(description).trim();
  if (status !== undefined) role.status = status === 'disabled' ? 'disabled' : 'active';

  if (isGlobal !== undefined) {
    const globalFlag = isGlobal !== false;
    role.isGlobal = globalFlag;
    if (!globalFlag) {
      if (!isValidObjectId(orgId)) {
        return res.status(400).json({ error: 'orgId is required for org-scoped roles' });
      }
      role.orgId = orgId;
    } else {
      role.orgId = null;
    }
  }

  await role.save();

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.role.update',
    entityType: 'RbacRole',
    entityId: String(role._id),
    before,
    after: role.toObject(),
    meta: null,
  });

  return res.json({ role: { ...role.toObject(), id: String(role._id) } });
};

exports.listGroups = async (req, res) => {
  const groups = await RbacGroup.find({}).sort({ createdAt: -1 }).lean();
  return res.json({
    groups: groups.map((g) => ({
      ...g,
      id: String(g._id),
      orgId: g.orgId ? String(g.orgId) : null,
    })),
  });
};

exports.createGroup = async (req, res) => {
  const { name, description, isGlobal, orgId, status } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  let resolvedOrgId = null;
  const globalFlag = isGlobal !== false;
  if (!globalFlag) {
    if (!isValidObjectId(orgId)) {
      return res.status(400).json({ error: 'orgId is required for org-scoped groups' });
    }
    resolvedOrgId = orgId;
  }

  const actor = getBasicAuthActor(req);

  const group = await RbacGroup.create({
    name: String(name).trim(),
    description: String(description || '').trim(),
    status: status === 'disabled' ? 'disabled' : 'active',
    isGlobal: globalFlag,
    orgId: resolvedOrgId,
  });

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.group.create',
    entityType: 'RbacGroup',
    entityId: String(group._id),
    before: null,
    after: group.toObject(),
    meta: null,
  });

  return res.status(201).json({ group: { ...group.toObject(), id: String(group._id) } });
};

exports.updateGroup = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid group id' });
  }

  const group = await RbacGroup.findById(id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const before = group.toObject();
  const actor = getBasicAuthActor(req);

  const { name, description, isGlobal, orgId, status } = req.body || {};
  if (name !== undefined) group.name = String(name).trim();
  if (description !== undefined) group.description = String(description).trim();
  if (status !== undefined) group.status = status === 'disabled' ? 'disabled' : 'active';

  if (isGlobal !== undefined) {
    const globalFlag = isGlobal !== false;
    group.isGlobal = globalFlag;
    if (!globalFlag) {
      if (!isValidObjectId(orgId)) {
        return res.status(400).json({ error: 'orgId is required for org-scoped groups' });
      }
      group.orgId = orgId;
    } else {
      group.orgId = null;
    }
  }

  await group.save();

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.group.update',
    entityType: 'RbacGroup',
    entityId: String(group._id),
    before,
    after: group.toObject(),
    meta: null,
  });

  return res.json({ group: { ...group.toObject(), id: String(group._id) } });
};

exports.listGroupMembers = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid group id' });
  }

  const links = await RbacGroupMember.find({ groupId: id }).select('userId createdAt').lean();
  const userIds = links.map((l) => l.userId);

  const users = await User.find({ _id: { $in: userIds } }).select('email name').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  return res.json({
    members: links.map((l) => {
      const u = byId.get(String(l.userId));
      return {
        id: String(l._id),
        userId: String(l.userId),
        email: u?.email || null,
        name: u?.name || '',
        createdAt: l.createdAt,
      };
    }),
  });
};

exports.addGroupMember = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body || {};
  if (!isValidObjectId(id) || !isValidObjectId(userId)) {
    return res.status(400).json({ error: 'group id and userId are required' });
  }

  const group = await RbacGroup.findById(id).select('isGlobal orgId status').lean();
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group.status !== 'active') {
    return res.status(400).json({ error: 'Group is not active' });
  }

  if (!group.isGlobal) {
    const exists = await OrganizationMember.exists({ orgId: group.orgId, userId, status: 'active' });
    if (!exists) {
      return res.status(400).json({ error: 'User is not an active member of the group org' });
    }
  }

  const actor = getBasicAuthActor(req);
  const member = await RbacGroupMember.create({ groupId: id, userId });

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.group_member.add',
    entityType: 'RbacGroup',
    entityId: String(id),
    before: null,
    after: { groupId: String(id), userId: String(userId) },
    meta: null,
  });

  return res.status(201).json({ member: { ...member.toObject(), id: String(member._id) } });
};

exports.removeGroupMember = async (req, res) => {
  const { id, memberId } = req.params;
  if (!isValidObjectId(id) || !isValidObjectId(memberId)) {
    return res.status(400).json({ error: 'Invalid ids' });
  }

  const actor = getBasicAuthActor(req);
  const link = await RbacGroupMember.findOne({ _id: memberId, groupId: id });
  if (!link) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const before = link.toObject();
  await link.deleteOne();

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.group_member.remove',
    entityType: 'RbacGroup',
    entityId: String(id),
    before,
    after: null,
    meta: null,
  });

  return res.json({ success: true });
};

exports.addGroupMembersBulk = async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body || {};

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid group id' });
  }

  const ids = Array.isArray(userIds) ? userIds.map((v) => String(v)).filter(Boolean) : [];
  const uniqueUserIds = Array.from(new Set(ids));

  if (uniqueUserIds.length === 0) {
    return res.status(400).json({ error: 'userIds is required' });
  }

  const group = await RbacGroup.findById(id).select('isGlobal orgId status').lean();
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group.status !== 'active') {
    return res.status(400).json({ error: 'Group is not active' });
  }

  const validUserIds = uniqueUserIds.filter((uid) => isValidObjectId(uid));
  if (validUserIds.length !== uniqueUserIds.length) {
    return res.status(400).json({ error: 'Invalid userIds' });
  }

  if (!group.isGlobal) {
    const rows = await OrganizationMember.find({ orgId: group.orgId, status: 'active', userId: { $in: validUserIds } })
      .select('userId')
      .lean();
    const allowed = new Set(rows.map((r) => String(r.userId)));
    const deniedUserIds = validUserIds.filter((uid) => !allowed.has(String(uid)));
    if (deniedUserIds.length) {
      return res.status(400).json({ error: 'Some users are not active members of the group org', deniedUserIds });
    }
  }

  const actor = getBasicAuthActor(req);

  const inserts = validUserIds.map((uid) => ({ groupId: id, userId: uid }));
  let insertedCount = 0;
  try {
    const created = await RbacGroupMember.insertMany(inserts, { ordered: false });
    insertedCount = Array.isArray(created) ? created.length : 0;
  } catch (e) {
    // Swallow duplicate-key errors; bubble up anything else
    if (!(e && Array.isArray(e.writeErrors))) throw e;
    insertedCount = Array.isArray(e.insertedDocs) ? e.insertedDocs.length : 0;
  }

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.group_member.bulk_add',
    entityType: 'RbacGroup',
    entityId: String(id),
    before: null,
    after: { groupId: String(id), userIds: validUserIds },
    meta: { insertedCount },
  });

  return res.status(201).json({ success: true, insertedCount });
};

exports.removeGroupMembersBulk = async (req, res) => {
  const { id } = req.params;
  const { memberIds } = req.body || {};

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid group id' });
  }

  const ids = Array.isArray(memberIds) ? memberIds.map((v) => String(v)).filter(Boolean) : [];
  const uniqueMemberIds = Array.from(new Set(ids));
  if (uniqueMemberIds.length === 0) {
    return res.status(400).json({ error: 'memberIds is required' });
  }

  const validMemberIds = uniqueMemberIds.filter((mid) => isValidObjectId(mid));
  if (validMemberIds.length !== uniqueMemberIds.length) {
    return res.status(400).json({ error: 'Invalid memberIds' });
  }

  const actor = getBasicAuthActor(req);
  const result = await RbacGroupMember.deleteMany({ groupId: id, _id: { $in: validMemberIds } });

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.group_member.bulk_remove',
    entityType: 'RbacGroup',
    entityId: String(id),
    before: null,
    after: { groupId: String(id), memberIds: validMemberIds },
    meta: { deletedCount: result?.deletedCount ?? null },
  });

  return res.json({ success: true, deletedCount: result?.deletedCount ?? 0 });
};

exports.listGroupRoles = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid group id' });
  }

  const links = await RbacGroupRole.find({ groupId: id }).select('roleId createdAt').lean();
  const roleIds = links.map((l) => l.roleId);

  const roles = await RbacRole.find({ _id: { $in: roleIds } })
    .select('key name status isGlobal orgId')
    .lean();
  const byId = new Map(roles.map((r) => [String(r._id), r]));

  return res.json({
    roles: links.map((l) => {
      const r = byId.get(String(l.roleId));
      return {
        id: String(l._id),
        roleId: String(l.roleId),
        key: r?.key || null,
        name: r?.name || null,
        status: r?.status || null,
        isGlobal: r?.isGlobal ?? null,
        orgId: r?.orgId ? String(r.orgId) : null,
        createdAt: l.createdAt,
      };
    }),
  });
};

exports.addGroupRole = async (req, res) => {
  const { id } = req.params;
  const { roleId } = req.body || {};
  if (!isValidObjectId(id) || !isValidObjectId(roleId)) {
    return res.status(400).json({ error: 'group id and roleId are required' });
  }

  const group = await RbacGroup.findById(id).select('isGlobal orgId status').lean();
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group.status !== 'active') {
    return res.status(400).json({ error: 'Group is not active' });
  }

  const role = await RbacRole.findById(roleId).select('isGlobal orgId status').lean();
  if (!role) {
    return res.status(404).json({ error: 'Role not found' });
  }
  if (role.status !== 'active') {
    return res.status(400).json({ error: 'Role is not active' });
  }

  // Scoping rules:
  // - Global group cannot have org-scoped roles
  // - Org-scoped group can have global roles and org-scoped roles of the same org
  if (group.isGlobal && !role.isGlobal) {
    return res.status(400).json({ error: 'Global groups cannot include org-scoped roles' });
  }

  if (!group.isGlobal && !role.isGlobal) {
    if (!group.orgId || !role.orgId || String(group.orgId) !== String(role.orgId)) {
      return res.status(400).json({ error: 'Org-scoped roles must match the group orgId' });
    }
  }

  const actor = getBasicAuthActor(req);
  const link = await RbacGroupRole.create({ groupId: id, roleId });

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.group_role.add',
    entityType: 'RbacGroup',
    entityId: String(id),
    before: null,
    after: { groupId: String(id), roleId: String(roleId) },
    meta: null,
  });

  return res.status(201).json({ groupRole: { ...link.toObject(), id: String(link._id) } });
};

exports.removeGroupRole = async (req, res) => {
  const { id, groupRoleId } = req.params;
  if (!isValidObjectId(id) || !isValidObjectId(groupRoleId)) {
    return res.status(400).json({ error: 'Invalid ids' });
  }

  const actor = getBasicAuthActor(req);
  const link = await RbacGroupRole.findOne({ _id: groupRoleId, groupId: id });
  if (!link) {
    return res.status(404).json({ error: 'Group role link not found' });
  }

  const before = link.toObject();
  await link.deleteOne();

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.group_role.remove',
    entityType: 'RbacGroup',
    entityId: String(id),
    before,
    after: null,
    meta: null,
  });

  return res.json({ success: true });
};

exports.listGrants = async (req, res) => {
  const { subjectType, subjectId, scopeType, scopeId, right } = req.query;
  const q = {};
  if (subjectType) q.subjectType = String(subjectType);
  if (subjectId && isValidObjectId(subjectId)) q.subjectId = subjectId;
  if (scopeType) q.scopeType = String(scopeType);
  if (scopeId && isValidObjectId(scopeId)) q.scopeId = scopeId;
  if (right) q.right = String(right);

  const grants = await RbacGrant.find(q).sort({ createdAt: -1 }).lean();
  return res.json({
    grants: grants.map((g) => ({
      ...g,
      id: String(g._id),
      subjectId: String(g.subjectId),
      scopeId: g.scopeId ? String(g.scopeId) : null,
    })),
  });
};

exports.createGrant = async (req, res) => {
  const { subjectType, subjectId, scopeType, scopeId, right, effect } = req.body || {};
  if (!subjectType || !isValidObjectId(subjectId) || !scopeType || !right) {
    return res.status(400).json({ error: 'subjectType, subjectId, scopeType, right are required' });
  }

  if (scopeType === 'org' && !isValidObjectId(scopeId)) {
    return res.status(400).json({ error: 'scopeId is required when scopeType=org' });
  }

  const actor = getBasicAuthActor(req);

  const grant = await RbacGrant.create({
    subjectType: String(subjectType),
    subjectId,
    scopeType: String(scopeType),
    scopeId: scopeType === 'org' ? scopeId : null,
    right: String(right).trim(),
    effect: effect === 'deny' ? 'deny' : 'allow',
    createdByActorType: actor.actorType,
    createdByActorId: actor.actorId,
  });

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.grant.create',
    entityType: 'RbacGrant',
    entityId: String(grant._id),
    before: null,
    after: grant.toObject(),
    meta: null,
  });

  return res.status(201).json({ grant: { ...grant.toObject(), id: String(grant._id) } });
};

exports.deleteGrant = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid grant id' });
  }

  const actor = getBasicAuthActor(req);
  const grant = await RbacGrant.findById(id);
  if (!grant) {
    return res.status(404).json({ error: 'Grant not found' });
  }

  const before = grant.toObject();
  await grant.deleteOne();

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.grant.delete',
    entityType: 'RbacGrant',
    entityId: String(id),
    before,
    after: null,
    meta: null,
  });

  return res.json({ success: true });
};

exports.listUserRoles = async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const rows = await RbacUserRole.find({ userId }).select('roleId createdAt').lean();
  const roleIds = rows.map((r) => r.roleId);
  const roles = await RbacRole.find({ _id: { $in: roleIds } }).select('key name status').lean();
  const byId = new Map(roles.map((r) => [String(r._id), r]));

  return res.json({
    roles: rows.map((r) => {
      const role = byId.get(String(r.roleId));
      return {
        id: String(r._id),
        roleId: String(r.roleId),
        key: role?.key || null,
        name: role?.name || null,
        status: role?.status || null,
        createdAt: r.createdAt,
      };
    }),
  });
};

exports.addUserRole = async (req, res) => {
  const { userId } = req.params;
  const { roleId } = req.body || {};
  if (!isValidObjectId(userId) || !isValidObjectId(roleId)) {
    return res.status(400).json({ error: 'userId and roleId are required' });
  }

  const actor = getBasicAuthActor(req);
  const link = await RbacUserRole.create({ userId, roleId });

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.user_role.add',
    entityType: 'User',
    entityId: String(userId),
    before: null,
    after: { roleId: String(roleId) },
    meta: null,
  });

  return res.status(201).json({ userRole: { ...link.toObject(), id: String(link._id) } });
};

exports.removeUserRole = async (req, res) => {
  const { userId, userRoleId } = req.params;
  if (!isValidObjectId(userId) || !isValidObjectId(userRoleId)) {
    return res.status(400).json({ error: 'Invalid ids' });
  }

  const actor = getBasicAuthActor(req);
  const link = await RbacUserRole.findOne({ _id: userRoleId, userId });
  if (!link) {
    return res.status(404).json({ error: 'User role link not found' });
  }

  const before = link.toObject();
  await link.deleteOne();

  await createAuditEvent({
    ...actor,
    action: 'admin.rbac.user_role.remove',
    entityType: 'User',
    entityId: String(userId),
    before,
    after: null,
    meta: null,
  });

  return res.json({ success: true });
};
