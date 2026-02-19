const { verifyAccessToken } = require("../utils/jwt");
const User = require("../models/User");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("api authenticate error:", error);
    return res
      .status(401)
      .json({ error: error.message || "Authentication failed" });
  }
};

// Basic auth middleware for admin routes
const basicAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).json({ error: "Authentication required" });
  }

  const credentials = Buffer.from(authHeader.substring(6), "base64").toString(
    "utf-8",
  );
  const [username, password] = credentials.split(":");

  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";

  if (username === adminUsername && password === adminPassword) {
    next();
  } else {
    console.error("api basicAuth error:", {
      username,
      password,
      adminUsername,
      adminPassword,
    });
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).json({ error: "Invalid credentials" });
  }
};

// Admin role middleware - requires authentication and admin role
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  next();
};

// Admin session authentication middleware - checks session for authenticated admin user
const adminSessionAuth = (req, res, next) => {
  // Check if session exists and user is authenticated
  if (!req.session || !req.session.authenticated) {
    // Store the originally requested URL for redirect after login
    req.session = req.session || {};
    req.session.returnTo = req.originalUrl;
    
    // For API routes, return JSON error
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ 
        error: "Authentication required", 
        redirectTo: `${req.adminPath || '/admin'}/login` 
      });
    }
    
    // For web routes, redirect to login page
    return res.redirect(`${req.adminPath || '/admin'}/login`);
  }

  // Verify session is still valid (check login time)
  const loginTime = new Date(req.session.loginTime);
  const now = new Date();
  const sessionAge = (now - loginTime) / (1000 * 60 * 60); // hours
  
  // Session expires after 24 hours
  if (sessionAge > 24) {
    req.session.destroy((err) => {
      if (err) console.error('Error destroying expired session:', err);
    });
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ 
        error: "Session expired", 
        redirectTo: `${req.adminPath || '/admin'}/login` 
      });
    }
    
    return res.redirect(`${req.adminPath || '/admin'}/login?error=Session expired`);
  }

  // Attach user info to request for consistency with other auth middleware
  req.user = {
    authenticated: true,
    authType: req.session.authType,
    role: req.session.role
  };

  if (req.session.authType === 'iam') {
    req.user.id = req.session.userId;
    req.user.email = req.session.email;
    req.user.name = req.session.name;
  } else {
    req.user.username = req.session.username;
  }

  next();
};

// Admin authentication middleware that supports both session and basic auth
const adminAuth = (req, res, next) => {
  // First try session authentication
  if (req.session && req.session.authenticated) {
    return adminSessionAuth(req, res, next);
  }
  
  // Fallback to basic auth for backward compatibility
  return basicAuth(req, res, next);
};

module.exports = { authenticate, basicAuth, requireAdmin, adminSessionAuth, adminAuth };
