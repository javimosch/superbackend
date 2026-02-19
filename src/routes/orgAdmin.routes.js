const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const orgAdminController = require('../controllers/orgAdmin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', adminSessionAuth, asyncHandler(orgAdminController.listOrgs));
router.post('/', adminSessionAuth, asyncHandler(orgAdminController.createOrganization));
router.get('/:orgId', adminSessionAuth, asyncHandler(orgAdminController.getOrg));
router.put('/:orgId', adminSessionAuth, asyncHandler(orgAdminController.updateOrganization));
router.patch('/:orgId/disable', adminSessionAuth, asyncHandler(orgAdminController.disableOrganization));
router.patch('/:orgId/enable', adminSessionAuth, asyncHandler(orgAdminController.enableOrganization));
router.delete('/:orgId', adminSessionAuth, asyncHandler(orgAdminController.deleteOrganization));

router.get('/:orgId/members', adminSessionAuth, asyncHandler(orgAdminController.listMembers));
router.post('/:orgId/members', adminSessionAuth, asyncHandler(orgAdminController.addMember));
router.patch('/:orgId/members/:memberId', adminSessionAuth, asyncHandler(orgAdminController.updateMember));
router.delete('/:orgId/members/:memberId', adminSessionAuth, asyncHandler(orgAdminController.removeMember));

router.get('/:orgId/invites', adminSessionAuth, asyncHandler(orgAdminController.listInvites));
router.post('/:orgId/invites', adminSessionAuth, asyncHandler(orgAdminController.createInvite));
router.delete('/:orgId/invites/:inviteId', adminSessionAuth, asyncHandler(orgAdminController.revokeInvite));
router.post('/:orgId/invites/:inviteId/resend', adminSessionAuth, asyncHandler(orgAdminController.resendInvite));

module.exports = router;
