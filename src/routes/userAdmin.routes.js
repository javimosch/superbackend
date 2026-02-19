const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const userAdminController = require('../controllers/userAdmin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/stats', adminSessionAuth, asyncHandler(userAdminController.getUserStats));
router.get('/', adminSessionAuth, asyncHandler(userAdminController.listUsers));
router.get('/:id', adminSessionAuth, asyncHandler(userAdminController.getUser));
router.patch('/:id', adminSessionAuth, asyncHandler(userAdminController.updateUser));
router.post('/:id/disable', adminSessionAuth, asyncHandler(userAdminController.disableUser));
router.post('/:id/enable', adminSessionAuth, asyncHandler(userAdminController.enableUser));

module.exports = router;
