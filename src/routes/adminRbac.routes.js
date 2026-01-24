const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminRbac.controller');

router.use(basicAuth);

router.get('/rights', controller.listRights);
router.get('/users', controller.searchUsers);
router.get('/users/:userId/orgs', controller.getUserOrgs);
router.post('/test', controller.testRight);

router.get('/roles', controller.listRoles);
router.post('/roles', controller.createRole);
router.patch('/roles/:id', controller.updateRole);

router.get('/groups', controller.listGroups);
router.post('/groups', controller.createGroup);
router.patch('/groups/:id', controller.updateGroup);
router.get('/groups/:id/members', controller.listGroupMembers);
router.post('/groups/:id/members', controller.addGroupMember);
router.delete('/groups/:id/members/:memberId', controller.removeGroupMember);
router.get('/groups/:id/roles', controller.listGroupRoles);
router.post('/groups/:id/roles', controller.addGroupRole);
router.delete('/groups/:id/roles/:groupRoleId', controller.removeGroupRole);

router.get('/grants', controller.listGrants);
router.post('/grants', controller.createGrant);
router.delete('/grants/:id', controller.deleteGrant);

router.get('/users/:userId/roles', controller.listUserRoles);
router.post('/users/:userId/roles', controller.addUserRole);
router.delete('/users/:userId/roles/:userRoleId', controller.removeUserRole);

module.exports = router;
