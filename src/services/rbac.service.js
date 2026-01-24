const mongoose = require('mongoose');

const OrganizationMember = require('../models/OrganizationMember');
const RbacUserRole = require('../models/RbacUserRole');
const RbacGroup = require('../models/RbacGroup');
const RbacGroupMember = require('../models/RbacGroupMember');
const RbacGroupRole = require('../models/RbacGroupRole');
const RbacGrant = require('../models/RbacGrant');
const { matches } = require('../utils/rbac/engine');

function normalizeId(input) {
  if (!input) return null;
  const str = String(input);
  if (!mongoose.Types.ObjectId.isValid(str)) return null;
  return new mongoose.Types.ObjectId(str);
}

function normalizeRight(input) {
  return String(input || '').trim();
}

function buildExplainItem(grant, source) {
  if (!grant) return null;
  return {
    source,
    effect: grant.effect,
    right: grant.right,
    subjectType: grant.subjectType,
    subjectId: String(grant.subjectId),
    scopeType: grant.scopeType,
    scopeId: grant.scopeId ? String(grant.scopeId) : null,
    id: String(grant._id),
  };
}

function extractMatches(grants, requiredRight) {
  const denies = [];
  const allows = [];

  for (const g of grants || []) {
    if (!g) continue;
    if (!matches(requiredRight, g.right)) continue;

    if (g.effect === 'deny') {
      denies.push(g);
    } else {
      allows.push(g);
    }
  }

  return { denies, allows };
}

async function getUserOrgIds(userId) {
  const uid = normalizeId(userId);
  if (!uid) return [];
  const rows = await OrganizationMember.find({ userId: uid, status: 'active' }).select('orgId').lean();
  return rows.map((r) => String(r.orgId));
}

async function getEffectiveGrants({ userId, orgId }) {
  const uid = normalizeId(userId);
  const oid = normalizeId(orgId);
  if (!uid || !oid) {
    return {
      grants: [],
      layers: { org: [], group: [], role: [], user: [] },
      explain: [],
      context: { roles: [], groups: [] },
      orgMember: null,
    };
  }

  const orgMember = await OrganizationMember.findOne({ userId: uid, orgId: oid, status: 'active' }).lean();
  if (!orgMember) {
    return {
      grants: [],
      layers: { org: [], group: [], role: [], user: [] },
      explain: [],
      context: { roles: [], groups: [] },
      orgMember: null,
    };
  }

  const [userRoleLinks, groupLinks, orgGrantsGlobal, orgGrantsOrg] = await Promise.all([
    RbacUserRole.find({ userId: uid }).select('roleId').lean(),
    RbacGroupMember.find({ userId: uid }).select('groupId').lean(),
    RbacGrant.find({ subjectType: 'org', subjectId: oid, scopeType: 'global' }).lean(),
    RbacGrant.find({ subjectType: 'org', subjectId: oid, scopeType: 'org', scopeId: oid }).lean(),
  ]);

  const directRoleIds = userRoleLinks.map((r) => r.roleId).filter(Boolean);
  const groupIds = groupLinks.map((g) => g.groupId).filter(Boolean);

  const groups = groupIds.length
    ? await RbacGroup.find({ _id: { $in: groupIds }, status: 'active' }).select('_id isGlobal orgId').lean()
    : [];

  const allowedGroupIds = [];
  for (const g of groups) {
    if (g.isGlobal) {
      allowedGroupIds.push(g._id);
      continue;
    }
    if (g.orgId && String(g.orgId) === String(oid)) {
      allowedGroupIds.push(g._id);
    }
  }

  const groupRoleLinks = allowedGroupIds.length
    ? await RbacGroupRole.find({ groupId: { $in: allowedGroupIds } }).select('groupId roleId').lean()
    : [];

  const groupRoleIds = groupRoleLinks.map((l) => l.roleId).filter(Boolean);
  const effectiveRoleIds = Array.from(new Set([...directRoleIds, ...groupRoleIds]));

  const [userGrantsGlobal, userGrantsOrg, roleGrantsGlobal, roleGrantsOrg, groupGrantsGlobal, groupGrantsOrg] = await Promise.all([
    RbacGrant.find({ subjectType: 'user', subjectId: uid, scopeType: 'global' }).lean(),
    RbacGrant.find({ subjectType: 'user', subjectId: uid, scopeType: 'org', scopeId: oid }).lean(),
    effectiveRoleIds.length ? RbacGrant.find({ subjectType: 'role', subjectId: { $in: effectiveRoleIds }, scopeType: 'global' }).lean() : [],
    effectiveRoleIds.length ? RbacGrant.find({ subjectType: 'role', subjectId: { $in: effectiveRoleIds }, scopeType: 'org', scopeId: oid }).lean() : [],
    allowedGroupIds.length ? RbacGrant.find({ subjectType: 'group', subjectId: { $in: allowedGroupIds }, scopeType: 'global' }).lean() : [],
    allowedGroupIds.length ? RbacGrant.find({ subjectType: 'group', subjectId: { $in: allowedGroupIds }, scopeType: 'org', scopeId: oid }).lean() : [],
  ]);

  const layers = {
    org: [...orgGrantsGlobal, ...orgGrantsOrg],
    group: [...groupGrantsGlobal, ...groupGrantsOrg],
    role: [...roleGrantsGlobal, ...roleGrantsOrg],
    user: [...userGrantsGlobal, ...userGrantsOrg],
  };

  const all = [...layers.org, ...layers.group, ...layers.role, ...layers.user];

  const explain = [];
  for (const g of userGrantsGlobal) explain.push(buildExplainItem(g, 'user:global'));
  for (const g of userGrantsOrg) explain.push(buildExplainItem(g, 'user:org'));
  for (const g of roleGrantsGlobal) explain.push(buildExplainItem(g, 'role:global'));
  for (const g of roleGrantsOrg) explain.push(buildExplainItem(g, 'role:org'));
  for (const g of groupGrantsGlobal) explain.push(buildExplainItem(g, 'group:global'));
  for (const g of groupGrantsOrg) explain.push(buildExplainItem(g, 'group:org'));
  for (const g of orgGrantsGlobal) explain.push(buildExplainItem(g, 'org:global'));
  for (const g of orgGrantsOrg) explain.push(buildExplainItem(g, 'org:org'));

  const context = {
    groups: groups.map((g) => ({
      id: String(g._id),
      isGlobal: !!g.isGlobal,
      orgId: g.orgId ? String(g.orgId) : null,
    })),
    roles: [
      ...directRoleIds.map((rid) => ({ roleId: String(rid), source: 'user' })),
      ...groupRoleLinks.map((l) => ({ roleId: String(l.roleId), source: 'group', groupId: String(l.groupId) })),
    ],
  };

  return { grants: all, layers, explain: explain.filter(Boolean), context, orgMember };
}

async function checkRight({ userId, orgId, right }) {
  const r = normalizeRight(right);
  if (!r) {
    return { allowed: false, reason: 'invalid_right', explain: [], context: null, decisionLayer: null };
  }

  const { layers, explain, context, orgMember } = await getEffectiveGrants({ userId, orgId });
  if (!orgMember) {
    return { allowed: false, reason: 'not_org_member', explain: [], context: null, decisionLayer: null };
  }

  const denyMatches = [];
  for (const [layerName, grants] of Object.entries(layers || {})) {
    const { denies } = extractMatches(grants, r);
    for (const d of denies) denyMatches.push({ layerName, grant: d });
  }

  if (denyMatches.length) {
    const matchedIds = new Set(denyMatches.map((m) => String(m.grant._id)));
    const filteredExplain = explain.filter((e) => matchedIds.has(String(e.id)));
    return {
      allowed: false,
      reason: 'denied',
      decisionLayer: 'deny',
      explain: filteredExplain,
      context,
    };
  }

  const allowPriority = ['org', 'group', 'role', 'user'];
  for (const layer of allowPriority) {
    const { allows } = extractMatches(layers?.[layer] || [], r);
    if (!allows.length) continue;

    const matchedIds = new Set(allows.map((a) => String(a._id)));
    const filteredExplain = explain.filter((e) => matchedIds.has(String(e.id)));
    return {
      allowed: true,
      reason: 'allowed',
      decisionLayer: layer,
      explain: filteredExplain,
      context,
    };
  }

  return { allowed: false, reason: 'no_match', explain: [], context, decisionLayer: null };
}

module.exports = {
  getUserOrgIds,
  getEffectiveGrants,
  checkRight,
};
