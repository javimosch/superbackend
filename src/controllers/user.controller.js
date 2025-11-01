const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const emailService = require('../services/email.service');

// Helper function to log activity
const logActivity = async (userId, action, category, description, metadata = {}, req) => {
  try {
    await ActivityLog.create({
      userId,
      action,
      category,
      description,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      metadata
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
    // Don't throw - activity logging should not break the main flow
  }
};

// PUT /api/user/profile - Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const userId = req.user._id;
    
    const updates = {};
    const changedFields = [];
    if (name !== undefined) {
      updates.name = name;
      changedFields.push('name');
    }
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      updates.email = email;
      changedFields.push('email');
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Log activity
    await logActivity(
      userId,
      'update_profile',
      'settings',
      `Updated profile: ${changedFields.join(', ')}`,
      { updatedFields: changedFields },
      req
    );
    
    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// PUT /api/user/password - Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required' 
      });
    }
    
    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'New password must be at least 8 characters long' 
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Update password (will be hashed by pre-save hook)
    user.passwordHash = newPassword;
    await user.save();
    
    // Log activity
    await logActivity(
      userId,
      'change_password',
      'auth',
      'User changed their password',
      {},
      req
    );
    
    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(user.email);
    } catch (emailError) {
      console.error('Failed to send password change email:', emailError);
      // Don't fail the request if email fails
    }
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// POST /api/user/password-reset-request - Request password reset
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Always return success message to prevent email enumeration
    const successMessage = 'If an account with that email exists, a password reset link has been sent.';
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (user) {
      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      // Set token and expiry (1 hour)
      user.passwordResetToken = hashedToken;
      user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      
      // Log activity
      await logActivity(
        user._id,
        'password_reset_request',
        'auth',
        'User requested password reset',
        { email: user.email },
        req
      );
      
      // Send reset email with plain token
      try {
        await emailService.sendPasswordResetEmail(user.email, resetToken);
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        // Still return success to user
      }
    }
    
    res.json({ message: successMessage });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
};

// POST /api/user/password-reset-confirm - Confirm password reset
exports.confirmPasswordReset = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ 
        error: 'Token and new password are required' 
      });
    }
    
    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long' 
      });
    }
    
    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpiry: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired password reset token' 
      });
    }
    
    // Update password (will be hashed by pre-save hook)
    user.passwordHash = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();
    
    // Log activity
    await logActivity(
      user._id,
      'password_reset_confirm',
      'auth',
      'User completed password reset',
      {},
      req
    );
    
    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(user.email);
    } catch (emailError) {
      console.error('Failed to send password change email:', emailError);
    }
    
    res.json({ message: 'Your password has been successfully reset' });
  } catch (error) {
    console.error('Error confirming password reset:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// DELETE /api/user/account - Delete user account
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user._id;
    
    if (!password) {
      return res.status(400).json({ 
        error: 'Password is required for account deletion' 
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify password for re-authentication
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    
    const userEmail = user.email;
    
    // Log activity before deletion
    await logActivity(
      userId,
      'delete_account',
      'auth',
      'User deleted their account',
      { email: userEmail },
      req
    );
    
    // Delete the user
    await User.findByIdAndDelete(userId);
    
    // Send confirmation email
    try {
      await emailService.sendAccountDeletionEmail(userEmail);
    } catch (emailError) {
      console.error('Failed to send account deletion email:', emailError);
    }
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

// GET /api/user/settings - Get user settings
exports.getSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      settings: user.settings || {}
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

// PUT /api/user/settings - Update user settings
exports.updateSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const newSettings = req.body;
    
    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ error: 'Settings must be an object' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Merge new settings with existing settings
    user.settings = {
      ...user.settings,
      ...newSettings
    };
    
    await user.save();
    
    // Log activity
    await logActivity(
      userId,
      'update_settings',
      'settings',
      'User updated their settings',
      { updatedKeys: Object.keys(newSettings) },
      req
    );
    
    res.json({
      message: 'Settings updated successfully',
      settings: user.settings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
