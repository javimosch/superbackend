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

// Mock EmailLog model since that's what the service actually uses
jest.mock('../models/EmailLog', () => ({
  create: jest.fn()
}));

jest.mock('../models/GlobalSetting', () => ({
  findOne: jest.fn()
}));

// Mock storage
jest.mock('./storage', () => ({
  saveEmailLog: jest.fn(),
  getEmailTemplate: jest.fn()
}));

const storage = require('./storage');

describe('Email Service', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.EMAIL_FROM = 'test@example.com';
    process.env.REPLY_TO_EMAIL = 'reply@example.com';
  });

  beforeEach(() => {
    // Reset the email service module to reinitialize with mocked dependencies
    jest.resetModules();
    jest.clearAllMocks();
    
    // Re-mock after resetModules
    jest.mock('resend', () => {
      return {
        Resend: jest.fn(() => mockResend)
      };
    });
    
    // Mock GlobalSetting to return API key
    const GlobalSetting = require('../models/GlobalSetting');
    GlobalSetting.findOne.mockImplementation(({ key }) => {
      // Return a chainable object with .lean() method
      return {
        lean: jest.fn().mockImplementation(() => {
          if (key === 'RESEND_API_KEY') {
            return Promise.resolve({ value: 'test-api-key' });
          }
          if (key === 'EMAIL_FROM') {
            return Promise.resolve({ value: 'test@example.com' });
          }
          return Promise.resolve(null);
        })
      };
    });
    
    // Mock EmailLog.create
    const EmailLog = require('../models/EmailLog');
    EmailLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    test('should send email successfully', async () => {
      const emailService = require('./email.service');
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>'
      };

      mockResend.emails.send.mockResolvedValue({
        data: { id: 'email_123' }
      });

      const result = await emailService.sendEmail(emailData);

      expect(mockResend.emails.send).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>',
        text: undefined
      });
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    test('should handle missing API key', async () => {
      // Force the service to use simulation mode by not having API key in either place
      delete process.env.RESEND_API_KEY;
      
      // Override GlobalSetting mock to return null for RESEND_API_KEY
      const GlobalSetting = require('../models/GlobalSetting');
      GlobalSetting.findOne.mockImplementation(({ key }) => {
        return {
          lean: jest.fn().mockResolvedValue(null)
        };
      });
      
      const emailService = require('./email.service');
      
      const result = await emailService.sendEmail({ to: 'test@test.com' });
      expect(result).toEqual(expect.objectContaining({ success: true, simulated: true }));
    }, 10000);

    test('should handle send error', async () => {
      const emailService = require('./email.service');
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>'
      };

      const sendError = new Error('Send failed');
      mockResend.emails.send.mockRejectedValue(sendError);

      await expect(emailService.sendEmail(emailData)).rejects.toThrow('Send failed');
    }, 10000);

    test('should use default from email when not provided', async () => {
      // This test verifies that when EMAIL_FROM is not in the database,
      // the default 'SuperBackend <no-reply@resend.dev>' is used
      
      // Delete EMAIL_FROM from environment (set it to undefined so fallback happens)
      delete process.env.EMAIL_FROM;
      
      // Get the already-loaded email service and clear its cache
      const emailService = require('./email.service');
      emailService.clearCache();
      
      // Override GlobalSetting mock to return null for EMAIL_FROM
      const GlobalSetting = require('../models/GlobalSetting');
      GlobalSetting.findOne.mockImplementation(({ key }) => {
        return {
          lean: jest.fn().mockImplementation(() => {
            if (key === 'RESEND_API_KEY') {
              return Promise.resolve({ value: 'test-api-key' });
            }
            if (key === 'EMAIL_FROM') {
              // Return null to simulate no database setting
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          })
        };
      });
      
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Email</h1>'
      };

      mockResend.emails.send.mockResolvedValue({
        data: { id: 'email_123' }
      });

      await emailService.sendEmail(emailData);

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'SuperBackend <no-reply@resend.dev>'
        })
      );
    }, 10000);

    test('should log successful email send in database', async () => {
      const EmailLog = require('../models/EmailLog');
      const emailService = require('./email.service');
      
      mockResend.emails.send.mockResolvedValue({
        data: { id: 'resend_123' }
      });

      await emailService.sendEmail({
        to: 'log@test.com',
        subject: 'Log Test',
        userId: 'u123'
      });

      expect(EmailLog.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'u123',
        status: 'sent',
        providerId: 'resend_123'
      }));
    });

    test('should log failed email send in database', async () => {
      const EmailLog = require('../models/EmailLog');
      const emailService = require('./email.service');
      
      mockResend.emails.send.mockResolvedValue({
        error: { message: 'Api Error' }
      });

      await expect(emailService.sendEmail({
        to: 'fail@test.com',
        subject: 'Fail Test'
      })).rejects.toThrow('Api Error');

      expect(EmailLog.create).toHaveBeenCalledWith(expect.objectContaining({
        status: 'failed',
        error: 'Api Error'
      }));
    });
  });

  describe('sendWelcomeEmail', () => {
    test('should send welcome email', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockResolvedValue({
        data: { id: 'email_123' }
      });

      const result = await emailService.sendWelcomeEmail('test@example.com', 'John Doe');

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['test@example.com'],
          subject: 'Welcome John Doe!',
          html: expect.stringContaining('Welcome John Doe!')
        })
      );
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    test('should handle send error', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockRejectedValue(new Error('Send failed'));

      await expect(emailService.sendWelcomeEmail('test@example.com', 'John'))
        .rejects.toThrow('Send failed');
    });
  });

  describe('sendPasswordResetEmail', () => {
    test('should send password reset email', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockResolvedValue({
        data: { id: 'email_123' }
      });

      const result = await emailService.sendPasswordResetEmail('test@example.com', 'token123');

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['test@example.com'],
          subject: 'Reset Your Password',
          html: expect.stringContaining('token123')
        })
      );
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    test('should handle send error', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockRejectedValue(new Error('Send failed'));

      await expect(emailService.sendPasswordResetEmail('test@example.com', 'token123'))
        .rejects.toThrow('Send failed');
    });
  });

  describe('sendNotificationEmail', () => {
    test('should send notification email', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockResolvedValue({
        data: { id: 'email_123' }
      });

      const result = await emailService.sendNotificationEmail(
        'test@example.com',
        'Test Notification',
        'This is a test message'
      );

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['test@example.com'],
          subject: 'Notification: Test Notification',
          html: expect.stringContaining('Test Notification')
        })
      );
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    test('should handle send error', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockRejectedValue(new Error('Send failed'));

      await expect(emailService.sendNotificationEmail(
        'test@example.com',
        'Test Notification',
        'This is a test message'
      )).rejects.toThrow('Send failed');
    });
  });

  describe('sendSubscriptionEmail', () => {
    test('should send subscription confirmation email', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockResolvedValue({
        data: { id: 'email_123' }
      });

      const result = await emailService.sendSubscriptionEmail(
        'test@example.com',
        'Pro',
        'active'
      );

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['test@example.com'],
          subject: 'Subscription active',
          html: expect.stringContaining('Pro')
        })
      );
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    test('should handle send error', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockRejectedValue(new Error('Send failed'));

      await expect(emailService.sendSubscriptionEmail(
        'test@example.com',
        'Pro',
        'active'
      )).rejects.toThrow('Send failed');
    });
  });

  describe('sendWaitingListEmail', () => {
    test('should send waiting list confirmation email', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockResolvedValue({
        data: { id: 'email_123' }
      });

      const result = await emailService.sendWaitingListEmail('test@example.com');

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['test@example.com'],
          subject: 'Welcome to our waiting list!',
          html: expect.stringContaining('test@example.com')
        })
      );
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    test('should handle send error', async () => {
      const emailService = require('./email.service');
      mockResend.emails.send.mockRejectedValue(new Error('Send failed'));

      await expect(emailService.sendWaitingListEmail('test@example.com'))
        .rejects.toThrow('Send failed');
    });
  });

  describe('replaceTemplateVariables', () => {
    test('should replace template variables correctly', () => {
      const emailService = require('./email.service');
      const template = 'Hello {{name}}, your plan is {{plan}}!';
      const variables = { name: 'John', plan: 'Pro' };

      const result = emailService.replaceTemplateVariables(template, variables);

      expect(result).toBe('Hello John, your plan is Pro!');
    });

    test('should handle missing variables', () => {
      const emailService = require('./email.service');
      const template = 'Hello {{name}}, your plan is {{plan}}!';
      const variables = { name: 'John' };

      const result = emailService.replaceTemplateVariables(template, variables);

      expect(result).toBe('Hello John, your plan is {{plan}}!');
    });

    test('should handle empty template', () => {
      const emailService = require('./email.service');
      const result = emailService.replaceTemplateVariables('', {});
      expect(result).toBe('');
    });
  });
});