// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate email format
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return emailRegex.test(email.trim());
};

// Validate password strength
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 8;
};

// Strip angle-bracket characters and trim whitespace
const sanitizeString = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
};

module.exports = {
  validateEmail,
  validatePassword,
  sanitizeString
};
