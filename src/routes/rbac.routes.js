const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const rbacService = require('../services/rbac.service');

router.get('/my-orgs', authenticate, async (req, res) => {
  const orgIds = await rbacService.getUserOrgIds(req.user._id);
  return res.json({ orgIds });
});

router.get('/my-rights', authenticate, async (req, res) => {
  const { orgId } = req.query;
  if (!orgId) {
    return res.status(400).json({ error: 'orgId is required' });
  }

  const { grants, explain, orgMember } = await rbacService.getEffectiveGrants({ userId: req.user._id, orgId });
  if (!orgMember) {
    return res.status(403).json({ error: 'You are not a member of this organization' });
  }

  return res.json({
    grants: grants.map((g) => ({
      id: String(g._id),
      right: g.right,
      effect: g.effect,
      subjectType: g.subjectType,
      subjectId: String(g.subjectId),
      scopeType: g.scopeType,
      scopeId: g.scopeId ? String(g.scopeId) : null,
    })),
    explain,
  });
});

router.post('/check', authenticate, async (req, res) => {
  const { orgId, right } = req.body || {};
  if (!orgId || !right) {
    return res.status(400).json({ error: 'orgId and right are required' });
  }

  const result = await rbacService.checkRight({ userId: req.user._id, orgId, right });
  return res.json({ allowed: result.allowed, reason: result.reason, decisionLayer: result.decisionLayer || null });
});

module.exports = router;
