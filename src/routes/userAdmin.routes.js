const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const userAdminController = require('../controllers/userAdmin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/stats', basicAuth, asyncHandler(userAdminController.getUserStats));
router.get('/', basicAuth, asyncHandler(userAdminController.listUsers));
router.get('/:id', basicAuth, asyncHandler(userAdminController.getUser));
router.patch('/:id', basicAuth, asyncHandler(userAdminController.updateUser));
router.post('/:id/disable', basicAuth, asyncHandler(userAdminController.disableUser));
router.post('/:id/enable', basicAuth, asyncHandler(userAdminController.enableUser));

module.exports = router;
