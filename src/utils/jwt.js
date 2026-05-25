const jwt = require('jsonwebtoken');

function getAccessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    console.warn('[jwt] WARNING: JWT_ACCESS_SECRET not set. Using insecure fallback. Set JWT_ACCESS_SECRET in environment.');
  }
  return secret || 'access-secret-change-me';
}

function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    console.warn('[jwt] WARNING: JWT_REFRESH_SECRET not set. Using insecure fallback. Set JWT_REFRESH_SECRET in environment.');
  }
  return secret || 'refresh-secret-change-me';
}

const generateAccessToken = (userId, role = 'user') => {
  return jwt.sign(
    { userId, role },
    getAccessSecret(),
    { expiresIn: '30d' }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    getRefreshSecret(),
    { expiresIn: '30d' }
  );
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, getAccessSecret());
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, getRefreshSecret());
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
