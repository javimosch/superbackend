// Email service wrapper using Resend
// Note: Resend package needs to be installed: npm install resend

const GlobalSetting = require("../models/GlobalSetting");
const EmailLog = require("../models/EmailLog");

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
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, value);
  }
  return result;
};

// Initialize Resend client if API key is available
const initResend = async () => {
  // Try to get API key from settings first, then fall back to env
  const apiKey = await getSetting("RESEND_API_KEY", process.env.RESEND_API_KEY);

  if (apiKey && !resendClient) {
    try {
      const { Resend } = require("resend");
      resendClient = new Resend(apiKey);
      console.log("✅ Resend email service initialized");
    } catch (error) {
      console.warn(
        "⚠️  Resend package not installed. Email functionality will be simulated.",
      );
      console.warn("   Install with: npm install resend");
    }
  }
};

// Initialize on module load
initResend().catch((err) => console.error("Error initializing Resend:", err));

const sendEmail = async ({
  to,
  subject,
  html,
  text,
  from,
  userId,
  type = "other",
  metadata,
}) => {
  const defaultFrom =
    from ||
    (await getSetting(
      "EMAIL_FROM",
      process.env.EMAIL_FROM || "SaaSBackend <no-reply@resend.dev>",
    ));
  const toArray = Array.isArray(to) ? to : [to];

  // If Resend is not configured, simulate email sending (for development)
  if (!resendClient) {
    console.log("📧 [SIMULATED EMAIL]");
    console.log("   To:", toArray.join(", "));
    console.log("   From:", defaultFrom);
    console.log("   Subject:", subject);
    console.log(
      "   Body Preview:",
      html ? html.substring(0, 100) + "..." : "No HTML",
    );
    console.log("   [Email would be sent in production with Resend API key]");

    // Log simulated email
    try {
      await EmailLog.create({
        userId,
        to: toArray,
        subject,
        type,
        status: "sent",
        metadata: { ...metadata, simulated: true },
      });
    } catch (err) {
      console.error("Error logging simulated email:", err.message);
    }

    return {
      success: true,
      simulated: true,
      message: "Email simulated (Resend not configured)",
    };
  }

  try {
    const { data, error } = await resendClient.emails.send({
      from: defaultFrom,
      to: toArray,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("❌ Email send error:", error);

      // Log failure
      await EmailLog.create({
        userId,
        to: toArray,
        subject,
        type,
        status: "failed",
        error: error.message,
        metadata,
      });

      throw new Error(error.message || "Failed to send email");
    }

    console.log("✅ Email sent successfully:", data);

    // Log success
    await EmailLog.create({
      userId,
      to: toArray,
      subject,
      type,
      providerId: data.id,
      status: "sent",
      metadata,
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("❌ Error sending email:", error);

    // Log failure (catch-all)
    try {
      await EmailLog.create({
        userId,
        to: toArray,
        subject,
        type,
        status: "failed",
        error: error.message,
        metadata,
      });
    } catch (logErr) {
      console.error("Error logging failed email:", logErr.message);
    }

    throw error;
  }
};

const sendPasswordResetEmail = async (email, resetToken) => {
  const frontendUrl = await getSetting(
    "FRONTEND_URL",
    process.env.FRONTEND_URL || "http://localhost:3000",
  );
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  // Try to get custom template from settings
  const customTemplate = await getSetting("EMAIL_PASSWORD_RESET_HTML", null);

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
      <p>We received a request to reset your password.</p>
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
    </div>
  `;
  }

  const subject = await getSetting(
    "EMAIL_PASSWORD_RESET_SUBJECT",
    "Reset Your Password",
  );

  return sendEmail({
    to: email,
    subject,
    html,
    type: "password-reset",
  });
};

const sendPasswordChangedEmail = async (email) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Changed Successfully</h2>
      <p>Hello,</p>
      <p>This is a confirmation that your account password has been changed successfully.</p>
      <p>If you made this change, you can safely ignore this email.</p>
      <p><strong>If you did not make this change, please contact our support team immediately.</strong></p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: "Password Changed",
    html,
    type: "password-changed",
  });
};

const sendAccountDeletionEmail = async (email) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Account Deleted</h2>
      <p>Hello,</p>
      <p>Your account has been successfully deleted as requested.</p>
      <p>We're sorry to see you go.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: "Account Deleted",
    html,
    type: "account-deleted",
  });
};

const sendWelcomeEmail = async (email, name) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome ${name}!</h2>
      <p>Thank you for joining our service. We're excited to have you on board.</p>
      <p>If you have any questions, feel free to reach out to our support team.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Welcome ${name}!`,
    html,
    type: "welcome",
  });
};

const sendNotificationEmail = async (email, title, message) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Notification: ${title}`,
    html,
    type: "notification",
  });
};

const sendSubscriptionEmail = async (email, planName, status) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Subscription ${status}</h2>
      <p>Plan: ${planName}</p>
      <p>Status: ${status}</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Subscription ${status}`,
    html,
    type: "subscription",
  });
};

const sendWaitingListEmail = async (email) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to our waiting list!</h2>
      <p>Thanks for joining, ${email}!</p>
      <p>We'll notify you as soon as a spot becomes available.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: "Welcome to our waiting list!",
    html,
    type: "waiting-list",
  });
};

const replaceTemplateVariables = (template, variables) => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, value);
  }
  return result;
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAccountDeletionEmail,
  sendWelcomeEmail,
  sendNotificationEmail,
  sendSubscriptionEmail,
  sendWaitingListEmail,
  replaceTemplateVariables,
};
