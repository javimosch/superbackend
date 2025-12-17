const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/invite.controller');
const { auditMiddleware } = require('../services/auditLogger');

router.get('/info', inviteController.getInviteInfo);
router.post('/accept', auditMiddleware('user.invite.accept', { entityType: 'Invite' }), inviteController.acceptInvite);

module.exports = router;
