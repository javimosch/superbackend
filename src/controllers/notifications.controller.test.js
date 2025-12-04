const {
  getNotifications,
  markNotificationAsRead,
  getActivityLog,
  createActivityLog
} = require('./notifications.controller');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');

// Mock dependencies
jest.mock('../models/Notification');
jest.mock('../models/ActivityLog');

// Mock console methods
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('Notifications Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      query: {},
      params: {},
      body: {},
      user: { _id: 'user123' },
      ip: '127.0.0.1',
      connection: { remoteAddress: '192.168.1.1' },
      get: jest.fn().mockReturnValue('Mozilla/5.0')
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  describe('getNotifications', () => {
    test('should get notifications with default pagination', async () => {
      const mockNotifications = [
        { _id: 'notif1', message: 'Test notification 1', read: false },
        { _id: 'notif2', message: 'Test notification 2', read: true }
      ];

      Notification.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockNotifications)
            })
          })
        })
      });
      Notification.countDocuments
        .mockResolvedValueOnce(25) // total
        .mockResolvedValueOnce(5); // unread

      await getNotifications(mockReq, mockRes);

      expect(Notification.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(mockRes.json).toHaveBeenCalledWith({
        notifications: mockNotifications,
        pagination: {
          total: 25,
          limit: 50,
          offset: 0,
          hasMore: false
        },
        unreadCount: 5
      });
    });

    test('should get notifications with custom pagination', async () => {
      mockReq.query = { limit: '10', offset: '20' };
      
      const mockNotifications = [];
      Notification.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockNotifications)
            })
          })
        })
      });
      Notification.countDocuments
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(15);

      await getNotifications(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        pagination: {
          total: 100,
          limit: 10,
          offset: 20,
          hasMore: true
        }
      }));
    });

    test('should filter for unread notifications only', async () => {
      mockReq.query = { unreadOnly: 'true' };

      Notification.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([])
            })
          })
        })
      });
      Notification.countDocuments.mockResolvedValue(0);

      await getNotifications(mockReq, mockRes);

      expect(Notification.find).toHaveBeenCalledWith({ userId: 'user123', read: false });
    });

    test('should handle database errors', async () => {
      Notification.find.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await getNotifications(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Error fetching notifications:', expect.any(Error));
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch notifications' });
    });
  });

  describe('markNotificationAsRead', () => {
    test('should mark notification as read successfully', async () => {
      mockReq.params = { id: 'notif123' };
      
      const mockNotification = {
        _id: 'notif123',
        userId: 'user123',
        message: 'Test notification',
        read: true
      };

      Notification.findOneAndUpdate.mockResolvedValue(mockNotification);

      await markNotificationAsRead(mockReq, mockRes);

      expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'notif123', userId: 'user123' },
        { read: true },
        { new: true }
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Notification marked as read',
        notification: mockNotification
      });
    });

    test('should return 404 when notification not found', async () => {
      mockReq.params = { id: 'nonexistent' };
      
      Notification.findOneAndUpdate.mockResolvedValue(null);

      await markNotificationAsRead(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Notification not found' });
    });

    test('should handle database errors', async () => {
      mockReq.params = { id: 'notif123' };
      
      Notification.findOneAndUpdate.mockRejectedValue(new Error('Database error'));

      await markNotificationAsRead(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Error marking notification as read:', expect.any(Error));
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to mark notification as read' });
    });
  });

  describe('getActivityLog', () => {
    test('should get activity log with default pagination', async () => {
      const mockActivities = [
        { _id: 'activity1', action: 'login', category: 'auth' },
        { _id: 'activity2', action: 'update_profile', category: 'settings' }
      ];

      ActivityLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockActivities)
            })
          })
        })
      });
      ActivityLog.countDocuments.mockResolvedValue(150);

      await getActivityLog(mockReq, mockRes);

      expect(ActivityLog.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(mockRes.json).toHaveBeenCalledWith({
        activities: mockActivities,
        pagination: {
          total: 150,
          limit: 50,
          offset: 0,
          hasMore: true
        }
      });
    });

    test('should filter by category and action', async () => {
      mockReq.query = { category: 'auth', action: 'login', limit: '25', offset: '10' };

      ActivityLog.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([])
            })
          })
        })
      });
      ActivityLog.countDocuments.mockResolvedValue(5);

      await getActivityLog(mockReq, mockRes);

      expect(ActivityLog.find).toHaveBeenCalledWith({
        userId: 'user123',
        category: 'auth',
        action: 'login'
      });
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        pagination: {
          total: 5,
          limit: 25,
          offset: 10,
          hasMore: false
        }
      }));
    });

    test('should handle database errors', async () => {
      ActivityLog.find.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await getActivityLog(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Error fetching activity log:', expect.any(Error));
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch activity log' });
    });
  });

  describe('createActivityLog', () => {
    test('should create activity log successfully', async () => {
      mockReq.body = {
        action: 'profile_update',
        category: 'settings',
        description: 'User updated profile information',
        metadata: { field: 'email' }
      };

      const mockActivity = {
        _id: 'activity123',
        userId: 'user123',
        action: 'profile_update',
        category: 'settings',
        description: 'User updated profile information'
      };

      ActivityLog.create.mockResolvedValue(mockActivity);

      await createActivityLog(mockReq, mockRes);

      expect(ActivityLog.create).toHaveBeenCalledWith({
        userId: 'user123',
        action: 'profile_update',
        category: 'settings',
        description: 'User updated profile information',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        metadata: { field: 'email' }
      });
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Activity log created',
        activity: mockActivity
      });
    });

    test('should return 400 when action is missing', async () => {
      mockReq.body = {
        category: 'settings',
        description: 'Test description'
      };

      await createActivityLog(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'action, category, and description are required'
      });
    });

    test('should return 400 when category is missing', async () => {
      mockReq.body = {
        action: 'test_action',
        description: 'Test description'
      };

      await createActivityLog(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'action, category, and description are required'
      });
    });

    test('should return 400 when description is missing', async () => {
      mockReq.body = {
        action: 'test_action',
        category: 'settings'
      };

      await createActivityLog(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'action, category, and description are required'
      });
    });

    test('should return 400 for invalid category', async () => {
      mockReq.body = {
        action: 'test_action',
        category: 'invalid_category',
        description: 'Test description'
      };

      await createActivityLog(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid category. Must be one of: auth, billing, content, settings, admin, other'
      });
    });

    test('should use default metadata when not provided', async () => {
      mockReq.body = {
        action: 'login',
        category: 'auth',
        description: 'User logged in'
      };

      ActivityLog.create.mockResolvedValue({});

      await createActivityLog(mockReq, mockRes);

      expect(ActivityLog.create).toHaveBeenCalledWith(expect.objectContaining({
        metadata: {}
      }));
    });

    test('should use fallback IP address from connection', async () => {
      mockReq.body = {
        action: 'login',
        category: 'auth',
        description: 'User logged in'
      };
      mockReq.ip = null;

      ActivityLog.create.mockResolvedValue({});

      await createActivityLog(mockReq, mockRes);

      expect(ActivityLog.create).toHaveBeenCalledWith(expect.objectContaining({
        ipAddress: '192.168.1.1'
      }));
    });

    test('should handle database errors', async () => {
      mockReq.body = {
        action: 'test_action',
        category: 'auth',
        description: 'Test description'
      };

      ActivityLog.create.mockRejectedValue(new Error('Database error'));

      await createActivityLog(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Error creating activity log:', expect.any(Error));
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to create activity log' });
    });

    test('should test all valid categories', async () => {
      const validCategories = ['auth', 'billing', 'content', 'settings', 'admin', 'other'];
      
      for (const category of validCategories) {
        mockReq.body = {
          action: 'test_action',
          category: category,
          description: `Test ${category} description`
        };

        ActivityLog.create.mockResolvedValue({});

        await createActivityLog(mockReq, mockRes);

        expect(ActivityLog.create).toHaveBeenCalledWith(expect.objectContaining({
          category: category
        }));
      }
    });
  });
});