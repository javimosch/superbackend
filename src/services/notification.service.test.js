const Notification = require('../models/Notification');
const User = require('../models/User');
const emailService = require('./email.service');
const {
  createNotification,
  sendEmailForNotification,
  sendToUser,
  sendToUsers,
  broadcast,
  getNotificationStats
} = require('./notification.service');

jest.mock('../models/Notification', () => ({
  create: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('../models/User', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));

jest.mock('./email.service', () => ({
  sendEmail: jest.fn()
}));

describe('notification.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createNotification', () => {
    test('creates a notification with default channel', async () => {
      const mockData = {
        userId: 'user123',
        type: 'info',
        title: 'Test',
        message: 'Message'
      };
      Notification.create.mockResolvedValue({ ...mockData, _id: 'notif123' });

      const result = await createNotification(mockData);

      expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
        ...mockData,
        channel: 'in_app',
        read: false,
        emailStatus: 'skipped'
      }));
      expect(result._id).toBe('notif123');
    });
  });

  describe('sendEmailForNotification', () => {
    test('sends email and updates notification status', async () => {
      const mockNotif = {
        _id: 'notif123',
        channel: 'email',
        type: 'success',
        title: 'Success',
        message: 'Job done',
        save: jest.fn().mockResolvedValue(true)
      };
      emailService.sendEmail.mockResolvedValue({ id: 'msg123' });

      await sendEmailForNotification(mockNotif, 'user@example.com');

      expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'user@example.com',
        subject: 'Success',
        type: 'notification'
      }));
      expect(mockNotif.emailStatus).toBe('sent');
      expect(mockNotif.save).toHaveBeenCalled();
    });

    test('handles email service failure', async () => {
      const mockNotif = {
        _id: 'notif123',
        channel: 'email',
        save: jest.fn().mockResolvedValue(true)
      };
      emailService.sendEmail.mockRejectedValue(new Error('Send failed'));

      await sendEmailForNotification(mockNotif, 'user@example.com');

      expect(mockNotif.emailStatus).toBe('failed');
      expect(mockNotif.save).toHaveBeenCalled();
    });
  });

  describe('sendToUser', () => {
    test('sends notification to specific user', async () => {
      const mockUser = { _id: 'user123', email: 'user@test.com' };
      User.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockUser) });
      Notification.create.mockResolvedValue({ _id: 'notif123', channel: 'in_app' });

      const result = await sendToUser({
        userId: 'user123',
        type: 'info',
        title: 'Title',
        message: 'Msg'
      });

      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(result._id).toBe('notif123');
    });

    test('throws error if user not found', async () => {
      User.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await expect(sendToUser({ userId: 'missing' })).rejects.toThrow('User not found');
    });
  });

  describe('broadcast', () => {
    test('sends notification to all filtered users', async () => {
      const mockUsers = [
        { _id: 'u1', email: 'u1@test.com' },
        { _id: 'u2', email: 'u2@test.com' }
      ];
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers)
      });
      User.findById.mockImplementation(id => ({
        lean: jest.fn().mockResolvedValue(mockUsers.find(u => u._id === id))
      }));
      Notification.create.mockImplementation(data => ({ ...data, _id: 'notif_' + data.userId }));

      const result = await broadcast({
        type: 'info',
        title: 'Broadcast',
        message: 'Hello everyone',
        userFilter: { role: 'user' }
      });

      expect(User.find).toHaveBeenCalledWith({ role: 'user' });
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
    });
  });

  describe('getNotificationStats', () => {
    test('returns aggregate counts', async () => {
      Notification.countDocuments.mockResolvedValue(10);

      const stats = await getNotificationStats();

      expect(stats).toEqual({
        total: 10,
        unread: 10,
        emailPending: 10,
        emailSent: 10,
        emailFailed: 10
      });
      expect(Notification.countDocuments).toHaveBeenCalledTimes(5);
    });
  });
});
