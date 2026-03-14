const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const asyncHandler = require('../utils/asyncHandler');
const githubService = require('../services/github.service');

// Register new user
const register = asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const user = new User({
    email: email.toLowerCase(),
    passwordHash: password,
    name
  });

  await user.save();

  const token = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  res.status(201).json({
    token,
    refreshToken,
    user: user.toJSON()
  });
});

// Login user
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  res.json({
    token,
    refreshToken,
    user: user.toJSON()
  });
});

// Refresh access token
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  const decoded = verifyRefreshToken(refreshToken);
  const newToken = generateAccessToken(decoded.userId);
  const newRefreshToken = generateRefreshToken(decoded.userId);

  res.json({ token: newToken, refreshToken: newRefreshToken });
});

// Get current user
const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toJSON() });
});

// Initiate GitHub OAuth flow
const githubLogin = asyncHandler(async (req, res) => {
  const state = githubService.generateState();
  
  // Store state in session for CSRF protection (if sessions are enabled)
  if (req.session) {
    req.session.githubOAuthState = state;
  }
  
  const authUrl = githubService.getAuthURL(state);
  
  // Return URL for frontend to redirect, or redirect directly
  if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
    res.json({ 
      success: true, 
      authUrl: authUrl,
      state: state 
    });
  } else {
    res.redirect(authUrl);
  }
});

// Handle GitHub OAuth callback
const githubCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code missing' });
  }

  // Verify state parameter for CSRF protection
  if (req.session?.githubOAuthState) {
    if (!state || state !== req.session.githubOAuthState) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    // Clear used state
    delete req.session.githubOAuthState;
  }

  // Exchange code for access token
  const tokenResponse = await githubService.getAccessToken(code, state);
  
  if (!tokenResponse.accessToken) {
    return res.status(400).json({ error: 'Failed to get access token' });
  }

  // Get user info from GitHub
  const githubUser = await githubService.getFullUserInfo(tokenResponse.accessToken);

  // Check if user exists with this GitHub ID
  let user = await User.findOne({ githubId: githubUser.id });

  if (!user) {
    // Check if user exists with this email
    const emailToCheck = githubUser.email || `${githubUser.login}@users.noreply.github.com`;
    user = await User.findOne({ email: emailToCheck.toLowerCase() });

    if (user) {
      // Link GitHub account to existing user
      user.githubId = githubUser.id;
      user.githubUsername = githubUser.login;
      user.githubAccessToken = tokenResponse.accessToken;
      if (tokenResponse.refreshToken) {
        user.githubRefreshToken = tokenResponse.refreshToken;
      }
      user.githubEmail = githubUser.email;
      user.avatar = githubUser.avatarUrl;
      if (githubUser.name) user.name = githubUser.name;
      user.emailVerified = githubUser.emailVerified || user.emailVerified;
      await user.save();
    } else {
      // Create new user
      user = new User({
        email: emailToCheck.toLowerCase(),
        name: githubUser.name || githubUser.login,
        githubId: githubUser.id,
        githubUsername: githubUser.login,
        githubAccessToken: tokenResponse.accessToken,
        githubRefreshToken: tokenResponse.refreshToken,
        githubEmail: githubUser.email,
        avatar: githubUser.avatarUrl,
        emailVerified: githubUser.emailVerified,
        role: 'user'
      });
      await user.save();
    }
  } else {
    // Update existing user's tokens and info
    user.githubAccessToken = tokenResponse.accessToken;
    if (tokenResponse.refreshToken) {
      user.githubRefreshToken = tokenResponse.refreshToken;
    }
    user.avatar = githubUser.avatarUrl;
    if (githubUser.name) user.name = githubUser.name;
    user.githubUsername = githubUser.login;
    await user.save();
  }

  // Generate JWT tokens
  const token = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Redirect to frontend with token in URL hash or return JSON
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
    res.json({
      success: true,
      token,
      refreshToken,
      user: user.toJSON()
    });
  } else {
    res.redirect(`${frontendUrl}/dashboard#token=${token}`);
  }
});

// Refresh GitHub access token
const githubRefreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const tokenResponse = await githubService.refreshAccessToken(refreshToken);
    
    res.json({
      success: true,
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = {
  register,
  login,
  refresh,
  me,
  githubLogin,
  githubCallback,
  githubRefreshToken
};