const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const notificationAdminController = require('../controllers/notificationAdmin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/stats', adminSessionAuth, asyncHandler(notificationAdminController.getNotificationStats));
router.get('/', adminSessionAuth, asyncHandler(notificationAdminController.listNotifications));
router.post('/send', adminSessionAuth, asyncHandler(notificationAdminController.sendNotification));
router.post('/broadcast', adminSessionAuth, asyncHandler(notificationAdminController.broadcastNotification));
router.delete('/:id', adminSessionAuth, asyncHandler(notificationAdminController.deleteNotification));
router.post('/:id/retry-email', adminSessionAuth, asyncHandler(notificationAdminController.retryEmailNotification));

module.exports = router;
