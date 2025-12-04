const emailService = require('./email.service');

// Mock Resend
const mockResend = {
  emails: {
    send: jest.fn()
  }
};

jest.mock('resend', () => {
  return {
    Resend: jest.fn(() => mockResend)
  };
});

// Mock storage
jest.mock('./storage', () => ({
  saveEmailLog: jest.fn(),
  getEmailTemplate: jest.fn()
}));

const storage = require('./storage');

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.FROM_EMAIL = 'test@example.com';
    process.env.REPLY_TO_EMAIL = 'reply@example.com';
  });

  describe('sendEmail', () => {
    test('should send email successfully', async () => {
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>'
      };

      mockResend.emails.send.mockResolvedValue({
        id: 'email_123',
        data: { id: 'email_123' }
      });
      storage.saveEmailLog.mockResolvedValue(true);

      const result = await emailService.sendEmail(emailData);

      expect(mockResend.emails.send).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>',
        reply_to: 'reply@example.com'
      });
      expect(storage.saveEmailLog).toHaveBeenCalled();
      expect(result).toEqual({ id: 'email_123' });
    });

    test('should handle missing API key', async () => {
      delete process.env.RESEND_API_KEY;

      await expect(emailService.sendEmail({ to: 'test@test.com' }))
        .rejects.toThrow('RESEND_API_KEY environment variable is required');
    });

    test('should handle send error', async () => {
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>'
      };

      const sendError = new Error('Send failed');
      mockResend.emails.send.mockRejectedValue(sendError);
      storage.saveEmailLog.mockResolvedValue(true);

      await expect(emailService.sendEmail(emailData)).rejects.toThrow('Send failed');
      
      expect(storage.saveEmailLog).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'Send failed'
        })
      );
    });

    test('should use default from email when not provided', async () => {
      delete process.env.FROM_EMAIL;
      
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>'
      };

      mockResend.emails.send.mockResolvedValue({ id: 'email_123' });

      await emailService.sendEmail(emailData);

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@yourdomain.com'
        })
      );
    });
  });

  describe('sendWelcomeEmail', () => {
    test('should send welcome email', async () => {
      storage.getEmailTemplate.mockResolvedValue({
        subject: 'Welcome {{name}}!',
        htmlBody: '<h1>Welcome {{name}}!</h1>',
        textBody: 'Welcome {{name}}!'
      });
      
      mockResend.emails.send.mockResolvedValue({ id: 'email_123' });
      storage.saveEmailLog.mockResolvedValue(true);

      const result = await emailService.sendWelcomeEmail('test@example.com', 'John Doe');

      expect(storage.getEmailTemplate).toHaveBeenCalledWith('welcome');
      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Welcome John Doe!',
          html: '<h1>Welcome John Doe!</h1>',
          text: 'Welcome John Doe!'
        })
      );
      expect(result).toEqual({ id: 'email_123' });
    });

    test('should handle template not found', async () => {
      storage.getEmailTemplate.mockResolvedValue(null);

      await expect(emailService.sendWelcomeEmail('test@example.com', 'John'))
        .rejects.toThrow('Email template "welcome" not found');
    });
  });

  describe('sendPasswordResetEmail', () => {
    test('should send password reset email', async () => {
      storage.getEmailTemplate.mockResolvedValue({
        subject: 'Password Reset',
        htmlBody: '<p>Reset token: {{resetToken}}</p>',
        textBody: 'Reset token: {{resetToken}}'
      });
      
      mockResend.emails.send.mockResolvedValue({ id: 'email_123' });
      storage.saveEmailLog.mockResolvedValue(true);

      const result = await emailService.sendPasswordResetEmail('test@example.com', 'token123');

      expect(storage.getEmailTemplate).toHaveBeenCalledWith('password-reset');
      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Password Reset',
          html: '<p>Reset token: token123</p>',
          text: 'Reset token: token123'
        })
      );
    });
  });

  describe('sendNotificationEmail', () => {
    test('should send notification email', async () => {
      storage.getEmailTemplate.mockResolvedValue({
        subject: 'Notification: {{title}}',
        htmlBody: '<h2>{{title}}</h2><p>{{message}}</p>',
        textBody: '{{title}}: {{message}}'
      });
      
      mockResend.emails.send.mockResolvedValue({ id: 'email_123' });
      storage.saveEmailLog.mockResolvedValue(true);

      const result = await emailService.sendNotificationEmail(
        'test@example.com',
        'Test Notification',
        'This is a test message'
      );

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Notification: Test Notification',
          html: '<h2>Test Notification</h2><p>This is a test message</p>',
          text: 'Test Notification: This is a test message'
        })
      );
    });
  });

  describe('sendSubscriptionEmail', () => {
    test('should send subscription confirmation email', async () => {
      storage.getEmailTemplate.mockResolvedValue({
        subject: 'Subscription {{status}}',
        htmlBody: '<p>Plan: {{planName}}, Status: {{status}}</p>',
        textBody: 'Plan: {{planName}}, Status: {{status}}'
      });
      
      mockResend.emails.send.mockResolvedValue({ id: 'email_123' });
      storage.saveEmailLog.mockResolvedValue(true);

      const result = await emailService.sendSubscriptionEmail(
        'test@example.com',
        'Pro',
        'active'
      );

      expect(storage.getEmailTemplate).toHaveBeenCalledWith('subscription-update');
      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Subscription active',
          html: '<p>Plan: Pro, Status: active</p>',
          text: 'Plan: Pro, Status: active'
        })
      );
    });
  });

  describe('sendWaitingListEmail', () => {
    test('should send waiting list confirmation email', async () => {
      storage.getEmailTemplate.mockResolvedValue({
        subject: 'Welcome to our waiting list!',
        htmlBody: '<p>Thanks for joining, {{email}}!</p>',
        textBody: 'Thanks for joining, {{email}}!'
      });
      
      mockResend.emails.send.mockResolvedValue({ id: 'email_123' });
      storage.saveEmailLog.mockResolvedValue(true);

      const result = await emailService.sendWaitingListEmail('test@example.com');

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          html: '<p>Thanks for joining, test@example.com!</p>'
        })
      );
    });
  });

  describe('replaceTemplateVariables', () => {
    test('should replace template variables correctly', () => {
      const template = 'Hello {{name}}, your plan is {{plan}}!';
      const variables = { name: 'John', plan: 'Pro' };

      const result = emailService.replaceTemplateVariables(template, variables);

      expect(result).toBe('Hello John, your plan is Pro!');
    });

    test('should handle missing variables', () => {
      const template = 'Hello {{name}}, your plan is {{plan}}!';
      const variables = { name: 'John' };

      const result = emailService.replaceTemplateVariables(template, variables);

      expect(result).toBe('Hello John, your plan is {{plan}}!');
    });

    test('should handle empty template', () => {
      const result = emailService.replaceTemplateVariables('', {});
      expect(result).toBe('');
    });
  });
});