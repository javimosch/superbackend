const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const orgAdminController = require('../controllers/orgAdmin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', basicAuth, asyncHandler(orgAdminController.listOrgs));
router.get('/:orgId', basicAuth, asyncHandler(orgAdminController.getOrg));

router.get('/:orgId/members', basicAuth, asyncHandler(orgAdminController.listMembers));
router.patch('/:orgId/members/:memberId', basicAuth, asyncHandler(orgAdminController.updateMember));
router.delete('/:orgId/members/:memberId', basicAuth, asyncHandler(orgAdminController.removeMember));

router.get('/:orgId/invites', basicAuth, asyncHandler(orgAdminController.listInvites));
router.post('/:orgId/invites', basicAuth, asyncHandler(orgAdminController.createInvite));
router.delete('/:orgId/invites/:inviteId', basicAuth, asyncHandler(orgAdminController.revokeInvite));
router.post('/:orgId/invites/:inviteId/resend', basicAuth, asyncHandler(orgAdminController.resendInvite));

module.exports = router;
