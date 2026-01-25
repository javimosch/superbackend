const {
  updateProfile,
  changePassword,
  requestPasswordReset,
  confirmPasswordReset,
  deleteAccount,
  getSettings,
  updateSettings
} = require('../controllers/user.controller');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const emailService = require('../services/email.service');
const crypto = require('crypto');

// Mock dependencies
jest.mock('../models/User');
jest.mock('../models/ActivityLog');
jest.mock('../services/email.service');

describe('User Controller', () => {
  let mockReq;
  let mockRes;
  let next;

  beforeEach(() => {
    mockReq = {
      user: {
        _id: 'user123',
        email: 'test@example.com',
        save: jest.fn().mockResolvedValue(true),
        comparePassword: jest.fn(),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', email: 'test@example.com' })
      },
      body: {},
      ip: '127.0.0.1',
      connection: {
        remoteAddress: '127.0.0.1'
      },
      get: jest.fn().mockReturnValue('test-agent'),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();

    User.findByIdAndUpdate.mockImplementation((id, updates) => {
      if (id === 'user123') return Promise.resolve({ _id: id, ...updates });
      return Promise.resolve(null);
    });
    User.findOne.mockResolvedValue(null);
    User.findById.mockResolvedValue(mockReq.user);
    ActivityLog.create.mockResolvedValue({});
  });

  describe('updateProfile', () => {
    test('should update user name and email successfully', async () => {
      mockReq.body = { name: 'Updated Name', email: 'updated@example.com' };
      await updateProfile(mockReq, mockRes, next);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Profile updated successfully' }));
    });
  });

  describe('changePassword', () => {
    test('should change password successfully', async () => {
      mockReq.body = { currentPassword: 'old-password', newPassword: 'new-password-123' };
      mockReq.user.comparePassword.mockResolvedValue(true);

      await changePassword(mockReq, mockRes);

      expect(mockReq.user.save).toHaveBeenCalled();
      expect(emailService.sendPasswordChangedEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Password changed successfully' });
    });

    test('should return 401 if current password incorrect', async () => {
      mockReq.body = { currentPassword: 'wrong', newPassword: 'new-password-123' };
      mockReq.user.comparePassword.mockResolvedValue(false);

      await changePassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
    });
  });

  describe('password reset', () => {
    test('requestPasswordReset should send email if user exists', async () => {
      mockReq.body = { email: 'test@example.com' };
      User.findOne.mockResolvedValue(mockReq.user);

      await requestPasswordReset(mockReq, mockRes);

      expect(mockReq.user.save).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ message: expect.any(String) });
    });

    test('confirmPasswordReset should update password with valid token', async () => {
      const token = 'valid-token';
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      mockReq.body = { token, newPassword: 'new-password-123' };
      
      User.findOne.mockResolvedValue(mockReq.user);

      await confirmPasswordReset(mockReq, mockRes);

      expect(mockReq.user.passwordHash).toBe('new-password-123');
      expect(mockReq.user.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Your password has been successfully reset' });
    });
  });

  describe('deleteAccount', () => {
    test('should delete account if password matches', async () => {
      mockReq.body = { password: 'correct-password' };
      mockReq.user.comparePassword.mockResolvedValue(true);

      await deleteAccount(mockReq, mockRes);

      expect(User.findByIdAndDelete).toHaveBeenCalledWith('user123');
      expect(emailService.sendAccountDeletionEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Account deleted successfully' });
    });
  });

  describe('settings', () => {
    test('getSettings should return user settings', async () => {
      mockReq.user.settings = { theme: 'dark' };
      await getSettings(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ settings: { theme: 'dark' } });
    });

    test('updateSettings should merge and save settings', async () => {
      mockReq.user.settings = { theme: 'light' };
      mockReq.body = { notifications: false };

      await updateSettings(mockReq, mockRes);

      expect(mockReq.user.settings).toEqual({ theme: 'light', notifications: false });
      expect(mockReq.user.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Settings updated successfully' }));
    });
  });
});