const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const notificationAdminController = require('../controllers/notificationAdmin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/stats', basicAuth, asyncHandler(notificationAdminController.getNotificationStats));
router.get('/', basicAuth, asyncHandler(notificationAdminController.listNotifications));
router.post('/send', basicAuth, asyncHandler(notificationAdminController.sendNotification));
router.post('/broadcast', basicAuth, asyncHandler(notificationAdminController.broadcastNotification));
router.delete('/:id', basicAuth, asyncHandler(notificationAdminController.deleteNotification));
router.post('/:id/retry-email', basicAuth, asyncHandler(notificationAdminController.retryEmailNotification));

module.exports = router;
