const crypto = require('crypto');

function base64UrlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generateApiTokenPlaintext() {
  const raw = crypto.randomBytes(32);
  return `hcms_${base64UrlEncode(raw)}`;
}

function hashToken(plaintext) {
  return crypto.createHash('sha256').update(String(plaintext)).digest('hex');
}

function timingSafeEqualHex(a, b) {
  const aBuf = Buffer.from(String(a), 'hex');
  const bBuf = Buffer.from(String(b), 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

module.exports = {
  generateApiTokenPlaintext,
  hashToken,
  timingSafeEqualHex,
};
