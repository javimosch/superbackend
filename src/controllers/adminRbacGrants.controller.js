const mongoose = require('mongoose');
const RbacRole = require('../models/RbacRole');
const RbacUserRole = require('../models/RbacUserRole');
const RbacGrant = require('../models/RbacGrant');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');

function isValidObjectId(id) {
  return id && mongoose.Types.ObjectId.isValid(String(id));
}

exports.listGrants = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('[RbacGrants] listGrants error:', error);
    return res.status(500).json({ error: error.message || 'Failed to list grants' });
  }
};

exports.createGrant = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('[RbacGrants] createGrant error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create grant' });
  }
};

exports.deleteGrant = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('[RbacGrants] deleteGrant error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete grant' });
  }
};

exports.listUserRoles = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('[RbacGrants] listUserRoles error:', error);
    return res.status(500).json({ error: error.message || 'Failed to list user roles' });
  }
};

exports.addUserRole = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('[RbacGrants] addUserRole error:', error);
    return res.status(500).json({ error: error.message || 'Failed to add user role' });
  }
};

exports.removeUserRole = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('[RbacGrants] removeUserRole error:', error);
    return res.status(500).json({ error: error.message || 'Failed to remove user role' });
  }
};
