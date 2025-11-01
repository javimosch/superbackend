const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const asyncHandler = require('../utils/asyncHandler');

// Register new user
const register = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

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
    passwordHash: password
  });

  await user.save();

  const token = generateAccessToken(user._id);
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

  const token = generateAccessToken(user._id);
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

module.exports = {
  register,
  login,
  refresh,
  me
};