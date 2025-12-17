const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const { getOrgRoleLevel, getOrgRoleHierarchy } = require('../utils/orgRoles');

const loadOrgContext = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    if (org.status !== 'active') {
      return res.status(403).json({ error: 'Organization is disabled' });
    }

    req.org = org;

    if (req.user) {
      const membership = await OrganizationMember.findOne({
        orgId: org._id,
        userId: req.user._id,
        status: 'active'
      });
      req.orgMember = membership;
    }

    next();
  } catch (error) {
    console.error('Error loading org context:', error);
    res.status(500).json({ error: 'Failed to load organization' });
  }
};

const requireOrgMember = (req, res, next) => {
  if (!req.orgMember) {
    return res.status(403).json({ error: 'You are not a member of this organization' });
  }
  next();
};

const requireOrgRoleAtLeast = (minRole) => {
  return async (req, res, next) => {
    try {
      if (!req.orgMember) {
        return res.status(403).json({ error: 'You are not a member of this organization' });
      }

      const hierarchy = await getOrgRoleHierarchy();
      if (!hierarchy[minRole]) {
        return res.status(500).json({ error: `Server misconfiguration: unknown role ${minRole}` });
      }

      const userLevel = await getOrgRoleLevel(req.orgMember.role);
      const requiredLevel = await getOrgRoleLevel(minRole);

      if (userLevel < requiredLevel) {
        return res.status(403).json({ error: `Requires ${minRole} role or higher` });
      }

      return next();
    } catch (error) {
      console.error('Error evaluating org role:', error);
      return res.status(500).json({ error: 'Failed to evaluate organization role' });
    }
  };
};

const requireOrgRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return async (req, res, next) => {
    try {
      if (!req.orgMember) {
        return res.status(403).json({ error: 'You are not a member of this organization' });
      }

      // Fail closed if a route is configured with roles unknown to the registry
      const hierarchy = await getOrgRoleHierarchy();
      const unknown = allowedRoles.filter((r) => !hierarchy[r]);
      if (unknown.length) {
        return res.status(500).json({ error: `Server misconfiguration: unknown roles ${unknown.join(', ')}` });
      }

      if (!allowedRoles.includes(req.orgMember.role)) {
        return res.status(403).json({ error: `Requires one of: ${allowedRoles.join(', ')}` });
      }

      return next();
    } catch (error) {
      console.error('Error evaluating org role:', error);
      return res.status(500).json({ error: 'Failed to evaluate organization role' });
    }
  };
};

module.exports = {
  loadOrgContext,
  requireOrgMember,
  requireOrgRoleAtLeast,
  requireOrgRole,
  // Deprecated export kept for backward compatibility with any internal imports.
  // Use ../utils/orgRoles instead.
  ROLE_HIERARCHY: undefined
};
