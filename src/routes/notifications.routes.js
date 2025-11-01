const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const notificationsController = require('../controllers/notifications.controller');

router.get('/notifications', authenticate, notificationsController.getNotifications);
router.put('/notifications/:id/read', authenticate, notificationsController.markNotificationAsRead);
router.get('/activity-log', authenticate, notificationsController.getActivityLog);
router.post('/activity-log', authenticate, notificationsController.createActivityLog);

module.exports = router;
