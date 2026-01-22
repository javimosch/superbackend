const crypto = require('crypto');

function base64UrlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generateProjectApiKeyPlaintext() {
  const raw = crypto.randomBytes(32);
  return `uk_${base64UrlEncode(raw)}`;
}

function hashKey(plaintext) {
  return crypto.createHash('sha256').update(String(plaintext)).digest('hex');
}

function timingSafeEqualHex(a, b) {
  const aBuf = Buffer.from(String(a), 'hex');
  const bBuf = Buffer.from(String(b), 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyKey(plaintext, expectedHash) {
  const provided = String(plaintext || '').trim();
  if (!provided) return false;
  const providedHash = hashKey(provided);
  return timingSafeEqualHex(providedHash, expectedHash);
}

module.exports = {
  generateProjectApiKeyPlaintext,
  hashKey,
  timingSafeEqualHex,
  verifyKey,
};
