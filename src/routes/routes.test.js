const express = require('express');
const request = require('supertest');

// Mock controllers
const mockAuthController = {
  register: jest.fn((req, res) => res.json({ message: 'registered' })),
  login: jest.fn((req, res) => res.json({ message: 'logged in' })),
  refresh: jest.fn((req, res) => res.json({ message: 'refreshed' })),
  me: jest.fn((req, res) => res.json({ message: 'user info' })),
};

const mockUserController = {
  updateProfile: jest.fn((req, res) => res.json({ message: 'profile updated' })),
  changePassword: jest.fn((req, res) => res.json({ message: 'password changed' })),
  requestPasswordReset: jest.fn((req, res) => res.json({ message: 'reset requested' })),
  confirmPasswordReset: jest.fn((req, res) => res.json({ message: 'reset confirmed' })),
  deleteAccount: jest.fn((req, res) => res.json({ message: 'account deleted' })),
  getSettings: jest.fn((req, res) => res.json({ message: 'settings retrieved' })),
  updateSettings: jest.fn((req, res) => res.json({ message: 'settings updated' })),
};

const mockAdminController = {
  getUsers: jest.fn((req, res) => res.json({ message: 'users list' })),
  registerUser: jest.fn((req, res) => res.json({ message: 'user registered' })),
  getUser: jest.fn((req, res) => res.json({ message: 'user details' })),
  updateUserSubscription: jest.fn((req, res) => res.json({ message: 'subscription updated' })),
  updateUserPassword: jest.fn((req, res) => res.json({ message: 'password updated' })),
  deleteUser: jest.fn((req, res) => res.json({ message: 'user deleted' })),
  reconcileUser: jest.fn((req, res) => res.json({ message: 'user reconciled' })),
  generateToken: jest.fn((req, res) => res.json({ message: 'token generated' })),
  getWebhookEvents: jest.fn((req, res) => res.json({ message: 'webhook events' })),
  getWebhookEvent: jest.fn((req, res) => res.json({ message: 'webhook event' })),
  retryFailedWebhookEvents: jest.fn((req, res) => res.json({ message: 'webhooks retried' })),
  retrySingleWebhookEvent: jest.fn((req, res) => res.json({ message: 'webhook retried' })),
  getWebhookStats: jest.fn((req, res) => res.json({ message: 'webhook stats' })),
  provisionCoolifyDeploy: jest.fn((req, res) => res.json({ message: 'coolify deploy provisioned' })),
};

const mockBillingController = {
  createCheckoutSession: jest.fn((req, res) => res.json({ message: 'checkout session created' })),
  createPortalSession: jest.fn((req, res) => res.json({ message: 'portal session created' })),
  handleWebhook: jest.fn((req, res) => res.json({ message: 'webhook handled' })),
  reconcileSubscription: jest.fn((req, res) => res.json({ message: 'subscription reconciled' })),
};

const mockGlobalSettingsController = {
  getPublicSettings: jest.fn((req, res) => res.json({ message: 'public settings' })),
  getAllSettings: jest.fn((req, res) => res.json({ message: 'all settings' })),
  getGlobalSettings: jest.fn((req, res) => res.json({ message: 'global settings' })),
  updateGlobalSettings: jest.fn((req, res) => res.json({ message: 'global settings updated' })),
  resetGlobalSettings: jest.fn((req, res) => res.json({ message: 'global settings reset' })),
  getGlobalSetting: jest.fn((req, res) => res.json({ message: 'global setting' })),
  setGlobalSetting: jest.fn((req, res) => res.json({ message: 'global setting set' })),
  updateSetting: jest.fn((req, res) => res.json({ message: 'global setting updated' })),
  createSetting: jest.fn((req, res) => res.json({ message: 'global setting set' })),
  revealSetting: jest.fn((req, res) => res.json({ message: 'setting revealed' })),
  deleteSetting: jest.fn((req, res) => res.json({ message: 'setting deleted' })),
  getSetting: jest.fn((req, res) => res.json({ message: 'global setting' })),
};

const mockNotificationsController = {
  getNotifications: jest.fn((req, res) => res.json({ message: 'notifications' })),
  markNotificationAsRead: jest.fn((req, res) => res.json({ message: 'marked as read' })),
  getActivityLog: jest.fn((req, res) => res.json({ message: 'activity log' })),
  createActivityLog: jest.fn((req, res) => res.json({ message: 'activity log created' })),
};

const mockWaitingListController = {
  subscribe: jest.fn((req, res) => res.json({ message: 'subscribed to waiting list' })),
  getStats: jest.fn((req, res) => res.json({ message: 'waiting list stats' })),
};

// Mock middleware
const mockAuth = {
  basicAuth: jest.fn((req, res, next) => next()),
  authenticate: jest.fn((req, res, next) => next())
};

jest.mock('../middleware/auth', () => mockAuth);

// Mock audit logger
jest.mock('../services/auditLogger', () => ({
  auditMiddleware: jest.fn(() => (req, res, next) => next())
}));

// Mock modules
jest.mock('../controllers/auth.controller', () => mockAuthController);
jest.mock('../controllers/user.controller', () => mockUserController);
jest.mock('../controllers/admin.controller', () => mockAdminController);
jest.mock('../controllers/billing.controller', () => mockBillingController);
jest.mock('../controllers/globalSettings.controller', () => mockGlobalSettingsController);
jest.mock('../controllers/notifications.controller', () => mockNotificationsController);
jest.mock('../controllers/waitingList.controller', () => mockWaitingListController);
jest.mock('../middleware/auth', () => mockAuth);

describe('Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  describe('Auth Routes', () => {
    beforeEach(() => {
      const authRoutes = require('./auth.routes');
      app.use('/api/auth', authRoutes);
    });

    test('POST /register should call register controller', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com', password: 'password' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('registered');
      expect(mockAuthController.register).toHaveBeenCalled();
    });

    test('POST /login should call login controller', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'password' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('logged in');
      expect(mockAuthController.login).toHaveBeenCalled();
    });

    test('POST /refresh-token should call refresh controller', async () => {
      const response = await request(app).post('/api/auth/refresh-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('refreshed');
      expect(mockAuthController.refresh).toHaveBeenCalled();
    });

    test('GET /me should call me controller with authentication', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('user info');
      expect(mockAuth.authenticate).toHaveBeenCalled();
      expect(mockAuthController.me).toHaveBeenCalled();
    });
  });

  describe('User Routes', () => {
    beforeEach(() => {
      const userRoutes = require('./user.routes');
      app.use('/api/user', userRoutes);
    });

    test('PUT /profile should call updateProfile controller', async () => {
      const response = await request(app).put('/api/user/profile');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('profile updated');
      expect(mockAuth.authenticate).toHaveBeenCalled();
      expect(mockUserController.updateProfile).toHaveBeenCalled();
    });

    test('PUT /password should call changePassword controller', async () => {
      const response = await request(app).put('/api/user/password');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('password changed');
      expect(mockUserController.changePassword).toHaveBeenCalled();
    });

    test('POST /password-reset-request should call requestPasswordReset controller', async () => {
      const response = await request(app).post('/api/user/password-reset-request');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('reset requested');
      expect(mockUserController.requestPasswordReset).toHaveBeenCalled();
    });

    test('POST /password-reset-confirm should call confirmPasswordReset controller', async () => {
      const response = await request(app).post('/api/user/password-reset-confirm');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('reset confirmed');
      expect(mockUserController.confirmPasswordReset).toHaveBeenCalled();
    });

    test('DELETE /account should call deleteAccount controller', async () => {
      const response = await request(app).delete('/api/user/account');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('account deleted');
      expect(mockUserController.deleteAccount).toHaveBeenCalled();
    });

    test('GET /settings should call getSettings controller', async () => {
      const response = await request(app).get('/api/user/settings');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('settings retrieved');
      expect(mockUserController.getSettings).toHaveBeenCalled();
    });

    test('PUT /settings should call updateSettings controller', async () => {
      const response = await request(app).put('/api/user/settings');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('settings updated');
      expect(mockUserController.updateSettings).toHaveBeenCalled();
    });
  });

  describe('Admin Routes', () => {
    beforeEach(() => {
      const adminRoutes = require('./admin.routes');
      app.use('/api/admin', adminRoutes);
    });

    test('GET /users should call getUsers controller', async () => {
      const response = await request(app).get('/api/admin/users');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('users list');
      expect(mockAuth.basicAuth).toHaveBeenCalled();
      expect(mockAdminController.getUsers).toHaveBeenCalled();
    });

    test('GET /users/:id should call getUser controller', async () => {
      const response = await request(app).get('/api/admin/users/123');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('user details');
      expect(mockAdminController.getUser).toHaveBeenCalled();
    });

    test('POST /generate-token should call generateToken controller', async () => {
      const response = await request(app).post('/api/admin/generate-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('token generated');
      expect(mockAdminController.generateToken).toHaveBeenCalled();
    });

    test('GET /stripe-webhooks should call getWebhookEvents controller', async () => {
      const response = await request(app).get('/api/admin/stripe-webhooks');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('webhook events');
      expect(mockAdminController.getWebhookEvents).toHaveBeenCalled();
    });

    test('POST /stripe-webhooks/retry should call retryFailedWebhookEvents controller', async () => {
      const response = await request(app).post('/api/admin/stripe-webhooks/retry');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('webhooks retried');
      expect(mockAdminController.retryFailedWebhookEvents).toHaveBeenCalled();
    });
  });

  describe('Billing Routes', () => {
    beforeEach(() => {
      const billingRoutes = require('./billing.routes');
      app.use('/api/billing', billingRoutes);
    });

    test('POST /create-checkout-session should call createCheckoutSession controller', async () => {
      const response = await request(app).post('/api/billing/create-checkout-session');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('checkout session created');
      expect(mockBillingController.createCheckoutSession).toHaveBeenCalled();
    });
  });

  describe('Global Settings Routes', () => {
    beforeEach(() => {
      const globalSettingsRoutes = require('./globalSettings.routes');
      app.use('/api/settings', globalSettingsRoutes);
    });

    test('GET / should call getAllSettings controller', async () => {
      const response = await request(app).get('/api/settings/');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('all settings');
      expect(mockGlobalSettingsController.getAllSettings).toHaveBeenCalled();
    });

    test('PUT /:key should call updateSetting controller', async () => {
      const response = await request(app).put('/api/settings/test-key');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('global setting updated');
      expect(mockGlobalSettingsController.updateSetting).toHaveBeenCalled();
    });

    test('POST /reset should call createSetting controller', async () => {
      const response = await request(app).post('/api/settings/');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('global setting set');
      expect(mockGlobalSettingsController.createSetting).toHaveBeenCalled();
    });
  });

  describe('Waiting List Routes', () => {
    beforeEach(() => {
      const waitingListRoutes = require('./waitingList.routes');
      app.use('/api/waiting-list', waitingListRoutes);
    });

    test('POST /subscribe should call subscribe controller', async () => {
      const response = await request(app).post('/api/waiting-list/subscribe');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('subscribed to waiting list');
      expect(mockWaitingListController.subscribe).toHaveBeenCalled();
    });

    test('GET /stats should call getStats controller', async () => {
      const response = await request(app).get('/api/waiting-list/stats');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('waiting list stats');
      expect(mockWaitingListController.getStats).toHaveBeenCalled();
    });
  });

  describe('Notifications Routes', () => {
    beforeEach(() => {
      const notificationsRoutes = require('./notifications.routes');
      app.use('/api', notificationsRoutes);
    });

    test('GET /notifications should call getNotifications controller', async () => {
      const response = await request(app).get('/api/notifications');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('notifications');
      expect(mockAuth.authenticate).toHaveBeenCalled();
      expect(mockNotificationsController.getNotifications).toHaveBeenCalled();
    });

    test('PUT /notifications/:id/read should call markNotificationAsRead controller', async () => {
      const response = await request(app).put('/api/notifications/123/read');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('marked as read');
      expect(mockNotificationsController.markNotificationAsRead).toHaveBeenCalled();
    });

    test('GET /activity-log should call getActivityLog controller', async () => {
      const response = await request(app).get('/api/activity-log');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('activity log');
      expect(mockNotificationsController.getActivityLog).toHaveBeenCalled();
    });
  });
});