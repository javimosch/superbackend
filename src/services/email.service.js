// Email service wrapper using Resend
// Note: Resend package needs to be installed: npm install resend

const GlobalSetting = require('../models/GlobalSetting');

let resendClient = null;

// Cache for settings
const settingsCache = new Map();
const CACHE_TTL = 60000; // 1 minute

// Helper to get setting with cache
const getSetting = async (key, defaultValue) => {
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }
  
  try {
    const setting = await GlobalSetting.findOne({ key }).lean();
    const value = setting ? setting.value : defaultValue;
    settingsCache.set(key, { value, timestamp: Date.now() });
    return value;
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    return defaultValue;
  }
};

// Helper to replace template variables
const replaceTemplateVars = (template, variables) => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
};

// Initialize Resend client if API key is available
const initResend = async () => {
  // Try to get API key from settings first, then fall back to env
  const apiKey = await getSetting('RESEND_API_KEY', process.env.RESEND_API_KEY);
  
  if (apiKey && !resendClient) {
    try {
      const { Resend } = require('resend');
      resendClient = new Resend(apiKey);
      console.log('✅ Resend email service initialized');
    } catch (error) {
      console.warn('⚠️  Resend package not installed. Email functionality will be simulated.');
      console.warn('   Install with: npm install resend');
    }
  }
};

// Initialize on module load
initResend().catch(err => console.error('Error initializing Resend:', err));

const sendEmail = async ({ to, subject, html, from }) => {
  const defaultFrom = from || await getSetting('EMAIL_FROM', process.env.EMAIL_FROM || 'NoteSyncer <onboarding@resend.dev>');
  
  // If Resend is not configured, simulate email sending (for development)
  if (!resendClient) {
    console.log('📧 [SIMULATED EMAIL]');
    console.log('   To:', to);
    console.log('   From:', defaultFrom);
    console.log('   Subject:', subject);
    console.log('   Body:', html);
    console.log('   [Email would be sent in production with Resend API key]');
    
    return {
      success: true,
      simulated: true,
      message: 'Email simulated (Resend not configured)'
    };
  }
  
  try {
    const { data, error } = await resendClient.emails.send({
      from: defaultFrom,
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    });
    
    if (error) {
      console.error('❌ Email send error:', error);
      throw new Error(error.message || 'Failed to send email');
    }
    
    console.log('✅ Email sent successfully:', data);
    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
};

const sendPasswordResetEmail = async (email, resetToken) => {
  const frontendUrl = await getSetting('FRONTEND_URL', process.env.FRONTEND_URL || 'http://localhost:3000');
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
  
  // Try to get custom template from settings
  const customTemplate = await getSetting('EMAIL_PASSWORD_RESET_HTML', null);
  
  let html;
  if (customTemplate) {
    // Use custom template with variable replacement
    html = replaceTemplateVars(customTemplate, { resetUrl });
  } else {
    // Use default template
    html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>Hello,</p>
      <p>We received a request to reset your password for your NoteSyncer account.</p>
      <p>Click the button below to reset your password:</p>
      <div style="margin: 30px 0;">
        <a href="${resetUrl}" 
           style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p style="color: #666; word-break: break-all;">${resetUrl}</p>
      <p><strong>This link will expire in 1 hour.</strong></p>
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
      <p style="color: #999; font-size: 12px;">
        NoteSyncer - AI-Powered Substack Notes Automation
      </p>
    </div>
  `;
  }
  
  const subject = await getSetting('EMAIL_PASSWORD_RESET_SUBJECT', 'Reset Your Password - NoteSyncer');
  
  return sendEmail({
    to: email,
    subject,
    html
  });
};

const sendPasswordChangedEmail = async (email) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Changed Successfully</h2>
      <p>Hello,</p>
      <p>This is a confirmation that your NoteSyncer account password has been changed successfully.</p>
      <p>If you made this change, you can safely ignore this email.</p>
      <p><strong>If you did not make this change, please contact our support team immediately.</strong></p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
      <p style="color: #999; font-size: 12px;">
        NoteSyncer - AI-Powered Substack Notes Automation
      </p>
    </div>
  `;
  
  return sendEmail({
    to: email,
    subject: 'Password Changed - NoteSyncer',
    html
  });
};

const sendAccountDeletionEmail = async (email) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Account Deleted</h2>
      <p>Hello,</p>
      <p>Your NoteSyncer account has been successfully deleted as requested.</p>
      <p>We're sorry to see you go. If you have any feedback, we'd love to hear from you.</p>
      <p>Thank you for using NoteSyncer!</p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
      <p style="color: #999; font-size: 12px;">
        NoteSyncer - AI-Powered Substack Notes Automation
      </p>
    </div>
  `;
  
  return sendEmail({
    to: email,
    subject: 'Account Deleted - NoteSyncer',
    html
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAccountDeletionEmail
};
