const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { loadOrgContext, requireOrgMember, requireOrgRoleAtLeast, requireOrgRole } = require('../middleware/org');
const orgController = require('../controllers/org.controller');
const inviteController = require('../controllers/invite.controller');
const { auditMiddleware } = require('../services/auditLogger');

router.get('/public', orgController.listPublicOrgs);

router.get('/', authenticate, auditMiddleware('user.org.list', { entityType: 'Org' }), orgController.listOrgs);
router.post('/', authenticate, auditMiddleware('user.org.create', { entityType: 'Org' }), orgController.createOrg);

router.get('/:orgId/public', orgController.getOrgPublic);

router.get('/:orgId', authenticate, loadOrgContext, requireOrgMember, auditMiddleware('user.org.get', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), orgController.getOrg);
router.put('/:orgId', authenticate, loadOrgContext, requireOrgRoleAtLeast('admin'), auditMiddleware('user.org.update', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), orgController.updateOrg);
router.delete('/:orgId', authenticate, loadOrgContext, requireOrgRole('owner'), auditMiddleware('user.org.delete', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), orgController.deleteOrg);

router.post('/:orgId/join', authenticate, loadOrgContext, auditMiddleware('user.org.join', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), orgController.joinOrg);

router.get('/:orgId/members', authenticate, loadOrgContext, requireOrgMember, auditMiddleware('user.org.members.list', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), orgController.listMembers);
router.post('/:orgId/members', authenticate, loadOrgContext, requireOrgRoleAtLeast('admin'), auditMiddleware('user.org.member.add', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), orgController.addMember);
router.put('/:orgId/members/:userId/role', authenticate, loadOrgContext, requireOrgRoleAtLeast('admin'), auditMiddleware('user.org.member.role.update', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), orgController.updateMemberRole);
router.delete('/:orgId/members/:userId', authenticate, loadOrgContext, requireOrgRoleAtLeast('admin'), auditMiddleware('user.org.member.remove', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), orgController.removeMember);

router.get('/:orgId/invites', authenticate, loadOrgContext, requireOrgRoleAtLeast('admin'), auditMiddleware('user.org.invites.list', { entityType: 'Org', getEntityId: (req) => req.params.orgId }), inviteController.listInvites);
router.post('/:orgId/invites', authenticate, loadOrgContext, requireOrgRoleAtLeast('admin'), auditMiddleware('user.org.invite.create', { entityType: 'OrgInvite', getEntityId: (req) => req.params.inviteId || req.params.orgId }), inviteController.createInvite);
router.delete('/:orgId/invites/:inviteId', authenticate, loadOrgContext, requireOrgRoleAtLeast('admin'), auditMiddleware('user.org.invite.revoke', { entityType: 'OrgInvite', getEntityId: (req) => req.params.inviteId }), inviteController.revokeInvite);

module.exports = router;
