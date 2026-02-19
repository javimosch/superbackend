const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const rbacService = require('../services/rbac.service');

/**
 * Auto-detect authentication type based on identifier format
 * @param {string} identifier - Email or username
 * @returns {string} 'iam' for email format, 'basic' for username format
 */
function detectAuthType(identifier) {
  return identifier.includes('@') ? 'iam' : 'basic';
}

/**
 * Validate basic auth credentials against environment variables
 * @param {string} username 
 * @param {string} password 
 * @returns {boolean} true if credentials are valid
 */
function validateBasicAuth(username, password) {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";
  
  return username === adminUsername && password === adminPassword;
}

/**
 * Serve the admin login page
 */
const getLogin = asyncHandler(async (req, res) => {
  // If already authenticated, redirect to admin dashboard
  if (req.session && req.session.authenticated) {
    return res.redirect(req.adminPath || '/admin');
  }

  const templatePath = require('path').join(__dirname, '..', '..', 'views', 'admin-login.ejs');
  const fs = require('fs');
  const ejs = require('ejs');

  fs.readFile(templatePath, 'utf8', (err, template) => {
    if (err) {
      console.error('Error reading login template:', err);
      return res.status(500).send('Error loading login page');
    }

    try {
      const html = ejs.render(template, {
        baseUrl: req.baseUrl,
        adminPath: req.adminPath || '/admin',
        error: req.query.error || null,
        success: req.query.success || null
      }, {
        filename: templatePath
      });
      res.send(html);
    } catch (renderErr) {
      console.error('Error rendering login template:', renderErr);
      res.status(500).send('Error rendering login page');
    }
  });
});

/**
 * Process login credentials (supports both basic auth and IAM)
 */
const postLogin = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.redirect(`${req.adminPath || '/admin'}/login?error=Email/username and password are required`);
  }

  const authType = detectAuthType(identifier);
  let user = null;
  let authData = {};

  try {
    if (authType === 'iam') {
      // IAM authentication - validate against User model
      user = await User.findOne({ email: identifier.toLowerCase() });
      
      if (!user) {
        return res.redirect(`${req.adminPath || '/admin'}/login?error=Invalid credentials`);
      }

      // Check RBAC permissions for admin panel access with backward compatibility
      const RbacUserRole = require('../models/RbacUserRole');
      const RbacRole = require('../models/RbacRole');
      const RbacGrant = require('../models/RbacGrant');
      const { matches } = require('../utils/rbac/engine');
      
      let hasAdminAccess = false;
      
      // Phase 1: Try RBAC assignment with pattern matching
      const userRoleAssignment = await RbacUserRole.findOne({ userId: user._id });
      if (userRoleAssignment) {
        const userRole = await RbacRole.findById(userRoleAssignment.roleId);
        if (userRole && userRole.status === 'active') {
          // Get all grants for this role
          const grants = await RbacGrant.find({
            subjectType: 'role',
            subjectId: userRole._id,
            scopeType: 'global',
            effect: 'allow'
          });
          
          // Check if any grant matches admin_panel__login using pattern matching
          hasAdminAccess = grants.some(grant => 
            matches('admin_panel__login', grant.right)
          );
          
          console.log(`RBAC check for user ${user.email}: role=${userRole.key}, grants=${grants.length}, hasAccess=${hasAdminAccess}`);
        }
      }
      
      // Phase 2: Fallback to IAM role for backward compatibility
      if (!hasAdminAccess && ['admin', 'superadmin'].includes(user.role)) {
        console.log(`Fallback to IAM role for user ${user.email}: role=${user.role}`);
        hasAdminAccess = true; // Admin and superadmin roles get panel access
      }
      
      if (!hasAdminAccess) {
        return res.redirect(`${req.adminPath || '/admin'}/login?error=Insufficient permissions - Admin panel access required`);
      }

      // Validate password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.redirect(`${req.adminPath || '/admin'}/login?error=Invalid credentials`);
      }

      // Get user's RBAC roles for session data
      let rbacRoles = [];
      try {
        // Get role information directly
        if (userRoleAssignment) {
          const userRole = await RbacRole.findById(userRoleAssignment.roleId);
          if (userRole) {
            rbacRoles = [{
              roleId: userRole._id,
              roleKey: userRole.key,
              roleName: userRole.name,
              grants: [] // We could populate this if needed
            }];
          }
        }
      } catch (error) {
        console.error('Error fetching RBAC roles:', error);
        // Continue without RBAC roles if there's an error
      }

      // Store IAM user session data with RBAC context
      authData = {
        authType: 'iam',
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role, // Keep for backward compatibility
        rbacRoles: rbacRoles, // New RBAC context
        authenticated: true,
        loginTime: new Date().toISOString()
      };

    } else {
      // Basic auth authentication - validate against environment variables
      const isValid = validateBasicAuth(identifier, password);
      
      if (!isValid) {
        return res.redirect(`${req.adminPath || '/admin'}/login?error=Invalid credentials`);
      }

      // Store basic auth session data
      authData = {
        authType: 'basic',
        username: identifier,
        role: 'admin', // Basic auth users have admin privileges
        authenticated: true,
        loginTime: new Date().toISOString()
      };
    }

    // Create session
    req.session = req.session || {};
    Object.assign(req.session, authData);
    
    // Regenerate session to prevent fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('Error regenerating session:', err);
        return res.redirect(`${req.adminPath || '/admin'}/login?error=Session error`);
      }

      // Store auth data in new session
      Object.assign(req.session, authData);
      
      // Save session and redirect
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Error saving session:', saveErr);
          return res.redirect(`${req.adminPath || '/admin'}/login?error=Session save error`);
        }

        // Redirect to admin dashboard or originally requested URL
        const redirectTo = req.session.returnTo || (req.adminPath || '/admin');
        delete req.session.returnTo;
        res.redirect(redirectTo);
      });
    });

  } catch (error) {
    console.error('Login error:', error);
    res.redirect(`${req.adminPath || '/admin'}/login?error=Authentication failed`);
  }
});

/**
 * Logout user and clear session
 */
const postLogout = asyncHandler(async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    
    res.redirect(`${req.adminPath || '/admin'}/login?success=Logged out successfully`);
  });
});

/**
 * Check current authentication status (API endpoint)
 */
const getAuthStatus = asyncHandler(async (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.json({ 
      authenticated: false, 
      authType: null,
      user: null 
    });
  }

  const authData = {
    authenticated: req.session.authenticated,
    authType: req.session.authType,
    loginTime: req.session.loginTime
  };

  if (req.session.authType === 'iam') {
    authData.user = {
      id: req.session.userId,
      email: req.session.email,
      name: req.session.name,
      role: req.session.role
    };
  } else {
    authData.user = {
      username: req.session.username,
      role: req.session.role
    };
  }

  res.json(authData);
});

module.exports = {
  getLogin,
  postLogin,
  postLogout,
  getAuthStatus
};
