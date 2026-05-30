const express = require('express');
const request = require('supertest');

// Mock the controller
const mockNotificationsController = {
  getNotifications: jest.fn(),
  markNotificationAsRead: jest.fn(),
  getActivityLog: jest.fn(),
  createActivityLog: jest.fn()
};

// Mock the auth middleware
const mockAuthMiddleware = {
  authenticate: jest.fn((req, res, next) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' };
    next();
  })
};

// Mock the audit middleware
const mockAuditMiddleware = {
  auditMiddleware: jest.fn().mockImplementation((action, options) => (req, res, next) => {
    req.auditAction = action;
    req.auditOptions = options;
    next();
  })
};

// Mock modules before requiring the routes
jest.mock('../controllers/notifications.controller', () => mockNotificationsController);
jest.mock('../middleware/auth', () => mockAuthMiddleware);
jest.mock('../services/auditLogger', () => mockAuditMiddleware);

const notificationsRoutes = require('./notifications.routes');

describe('notifications.routes', () => {
  let app;

  beforeAll(() => {
    // Audit middleware should be called during module load for specific endpoints
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith(
      'user.notification.read',
      { entityType: 'Notification', getEntityId: expect.any(Function) }
    );
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith(
      'user.activity_log.create',
      { entityType: 'ActivityLog' }
    );
  });

  beforeEach(() => {
    // Reset controller mocks
    Object.values(mockNotificationsController).forEach(mock => mock.mockClear());
    mockAuthMiddleware.authenticate.mockClear();

    // Create express app
    app = express();
    app.use(express.json());
    app.use('/api', notificationsRoutes);
  });

  describe('GET /notifications', () => {
    it('should apply authenticate middleware', async () => {
      mockNotificationsController.getNotifications.mockImplementation((req, res) => {
        expect(req.user).toEqual({ id: 'test-user-id', email: 'test@example.com' });
        res.json({ notifications: [] });
      });

      await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });

    it('should call notificationsController.getNotifications', async () => {
      mockNotificationsController.getNotifications.mockImplementation((req, res) => {
        res.json({ notifications: [] });
      });

      await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockNotificationsController.getNotifications).toHaveBeenCalledTimes(1);
    });

    it('should handle successful notifications response', async () => {
      const mockNotifications = {
        notifications: [
          { id: '1', message: 'Test notification 1', read: false },
          { id: '2', message: 'Test notification 2', read: true }
        ],
        total: 2,
        unread: 1
      };
      mockNotificationsController.getNotifications.mockImplementation((req, res) => {
        res.json(mockNotifications);
      });

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toEqual(mockNotifications);
    });

    it('should handle notifications errors', async () => {
      const mockError = { error: 'Failed to fetch notifications' };
      mockNotificationsController.getNotifications.mockImplementation((req, res) => {
        res.status(500).json(mockError);
      });

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toEqual(mockError);
    });

    it('should pass query parameters to controller', async () => {
      mockNotificationsController.getNotifications.mockImplementation((req, res) => {
        expect(req.query.page).toBe('1');
        expect(req.query.limit).toBe('10');
        expect(req.query.unread).toBe('true');
        res.json({ notifications: [] });
      });

      await request(app)
        .get('/api/notifications?page=1&limit=10&unread=true')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });
  });

  describe('PUT /notifications/:id/read', () => {
    it('should apply authenticate middleware', async () => {
      mockNotificationsController.markNotificationAsRead.mockImplementation((req, res) => {
        expect(req.user).toEqual({ id: 'test-user-id', email: 'test@example.com' });
        res.json({ success: true });
      });

      await request(app)
        .put('/api/notifications/123/read')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });

    it('should apply audit middleware with correct action', async () => {
      mockNotificationsController.markNotificationAsRead.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('user.notification.read');
        expect(req.auditOptions.entityType).toBe('Notification');
        expect(req.auditOptions.getEntityId).toEqual(expect.any(Function));
        res.json({ success: true });
      });

      await request(app)
        .put('/api/notifications/456/read')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });

    it('should call notificationsController.markNotificationAsRead', async () => {
      mockNotificationsController.markNotificationAsRead.mockImplementation((req, res) => {
        expect(req.params.id).toBe('notification-123');
        res.json({ success: true });
      });

      await request(app)
        .put('/api/notifications/notification-123/read')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockNotificationsController.markNotificationAsRead).toHaveBeenCalledTimes(1);
    });

    it('should handle successful mark as read response', async () => {
      const mockResponse = { success: true, notification: { id: '123', read: true } };
      mockNotificationsController.markNotificationAsRead.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .put('/api/notifications/123/read')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle mark as read errors', async () => {
      const mockError = { error: 'Notification not found' };
      mockNotificationsController.markNotificationAsRead.mockImplementation((req, res) => {
        res.status(404).json(mockError);
      });

      const response = await request(app)
        .put('/api/notifications/nonexistent/read')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body).toEqual(mockError);
    });

    it('should test audit middleware getEntityId function', () => {
      const auditCall = mockAuditMiddleware.auditMiddleware.mock.calls.find(
        call => call[0] === 'user.notification.read'
      );
      expect(auditCall).toBeDefined();
      const getEntityId = auditCall[1].getEntityId;
      expect(getEntityId({ params: { id: 'test-id-123' } })).toBe('test-id-123');
    });
  });

  describe('GET /activity-log', () => {
    it('should apply authenticate middleware', async () => {
      mockNotificationsController.getActivityLog.mockImplementation((req, res) => {
        expect(req.user).toEqual({ id: 'test-user-id', email: 'test@example.com' });
        res.json({ activities: [] });
      });

      await request(app)
        .get('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });

    it('should call notificationsController.getActivityLog', async () => {
      mockNotificationsController.getActivityLog.mockImplementation((req, res) => {
        res.json({ activities: [] });
      });

      await request(app)
        .get('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockNotificationsController.getActivityLog).toHaveBeenCalledTimes(1);
    });

    it('should handle successful activity log response', async () => {
      const mockActivityLog = {
        activities: [
          { id: '1', action: 'login', timestamp: '2024-01-01T10:00:00Z' },
          { id: '2', action: 'notification_read', timestamp: '2024-01-01T11:00:00Z' }
        ],
        total: 2,
        page: 1
      };
      mockNotificationsController.getActivityLog.mockImplementation((req, res) => {
        res.json(mockActivityLog);
      });

      const response = await request(app)
        .get('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toEqual(mockActivityLog);
    });

    it('should handle activity log errors', async () => {
      const mockError = { error: 'Failed to fetch activity log' };
      mockNotificationsController.getActivityLog.mockImplementation((req, res) => {
        res.status(500).json(mockError);
      });

      const response = await request(app)
        .get('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toEqual(mockError);
    });

    it('should pass query parameters to controller', async () => {
      mockNotificationsController.getActivityLog.mockImplementation((req, res) => {
        expect(req.query.action).toBe('login');
        expect(req.query.date).toBe('2024-01-01');
        res.json({ activities: [] });
      });

      await request(app)
        .get('/api/activity-log?action=login&date=2024-01-01')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });
  });

  describe('POST /activity-log', () => {
    it('should apply authenticate middleware', async () => {
      mockNotificationsController.createActivityLog.mockImplementation((req, res) => {
        expect(req.user).toEqual({ id: 'test-user-id', email: 'test@example.com' });
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .send({ action: 'custom_action' })
        .expect(201);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });

    it('should apply audit middleware with correct action', async () => {
      mockNotificationsController.createActivityLog.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('user.activity_log.create');
        expect(req.auditOptions).toEqual({ entityType: 'ActivityLog' });
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .send({ action: 'test_action' })
        .expect(201);
    });

    it('should call notificationsController.createActivityLog', async () => {
      mockNotificationsController.createActivityLog.mockImplementation((req, res) => {
        res.status(201).json({ id: 'new-activity-123' });
      });

      await request(app)
        .post('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .send({ action: 'api_call', metadata: { endpoint: '/test' } })
        .expect(201);

      expect(mockNotificationsController.createActivityLog).toHaveBeenCalledTimes(1);
    });

    it('should handle successful activity log creation', async () => {
      const mockResponse = {
        id: 'activity-456',
        action: 'custom_action',
        timestamp: '2024-01-01T12:00:00Z'
      };
      mockNotificationsController.createActivityLog.mockImplementation((req, res) => {
        res.status(201).json(mockResponse);
      });

      const response = await request(app)
        .post('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .send({ action: 'custom_action' })
        .expect(201);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle activity log creation errors', async () => {
      const mockError = { error: 'Invalid action type' };
      mockNotificationsController.createActivityLog.mockImplementation((req, res) => {
        res.status(400).json(mockError);
      });

      const response = await request(app)
        .post('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .send({ action: 'invalid_action' })
        .expect(400);

      expect(response.body).toEqual(mockError);
    });

    it('should pass request body to controller', async () => {
      const requestData = {
        action: 'document_view',
        metadata: { documentId: 'doc-123', duration: 300 }
      };
      mockNotificationsController.createActivityLog.mockImplementation((req, res) => {
        expect(req.body).toEqual(requestData);
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/api/activity-log')
        .set('Authorization', 'Bearer valid-token')
        .send(requestData)
        .expect(201);
    });
  });

  describe('Route Integration', () => {
    it('should apply authentication to all endpoints', async () => {
      mockNotificationsController.getNotifications.mockImplementation((req, res) => res.json({}));
      mockNotificationsController.markNotificationAsRead.mockImplementation((req, res) => res.json({}));
      mockNotificationsController.getActivityLog.mockImplementation((req, res) => res.json({}));
      mockNotificationsController.createActivityLog.mockImplementation((req, res) => res.status(201).json({}));

      await request(app).get('/api/notifications').expect(200);
      await request(app).put('/api/notifications/123/read').expect(200);
      await request(app).get('/api/activity-log').expect(200);
      await request(app).post('/api/activity-log').send({}).expect(201);

      // All 4 endpoints should have called authenticate middleware
      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(4);
    });

    it('should apply audit middleware only to specific endpoints', async () => {
      mockNotificationsController.getNotifications.mockImplementation((req, res) => {
        expect(req.auditAction).toBeUndefined();
        res.json({});
      });

      mockNotificationsController.markNotificationAsRead.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('user.notification.read');
        res.json({});
      });

      mockNotificationsController.getActivityLog.mockImplementation((req, res) => {
        expect(req.auditAction).toBeUndefined();
        res.json({});
      });

      mockNotificationsController.createActivityLog.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('user.activity_log.create');
        res.status(201).json({});
      });

      await request(app).get('/api/notifications').expect(200);
      await request(app).put('/api/notifications/123/read').expect(200);
      await request(app).get('/api/activity-log').expect(200);
      await request(app).post('/api/activity-log').send({}).expect(201);

      // Audit middleware should be called only twice (for specific endpoints)
      expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledTimes(2);
    });
  });
});