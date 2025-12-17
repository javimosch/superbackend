const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const notificationsController = require('../controllers/notifications.controller');
const { auditMiddleware } = require('../services/auditLogger');

router.get('/notifications', authenticate, notificationsController.getNotifications);
router.put('/notifications/:id/read', authenticate, auditMiddleware('user.notification.read', { entityType: 'Notification', getEntityId: (req) => req.params.id }), notificationsController.markNotificationAsRead);
router.get('/activity-log', authenticate, notificationsController.getActivityLog);
router.post('/activity-log', authenticate, auditMiddleware('user.activity_log.create', { entityType: 'ActivityLog' }), notificationsController.createActivityLog);

module.exports = router;
