const crypto = require('crypto');

function getEncryptionKey() {
  // Try new name first, then fallback to old name for backward compatibility
  const raw = process.env.SUPERBACKEND_ENCRYPTION_KEY || process.env.SAASBACKEND_ENCRYPTION_KEY;
  
  if (!raw) {
    throw new Error('SUPERBACKEND_ENCRYPTION_KEY (or SAASBACKEND_ENCRYPTION_KEY for compatibility) is required for encrypted settings');
  }

  let key;
  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    try {
      key = Buffer.from(raw, 'base64');
    } catch (e) {
      key = null;
    }

    if (!key || key.length !== 32) {
      key = Buffer.from(raw, 'utf8');
    }
  }

  if (key.length !== 32) {
    throw new Error(
      'SUPERBACKEND_ENCRYPTION_KEY (or SAASBACKEND_ENCRYPTION_KEY) must be 32 bytes (base64-encoded 32 bytes, hex 64 chars, or 32-char utf8)',
    );
  }

  return key;
}

function encryptString(plaintext, { keyId = 'v1' } = {}) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    alg: 'aes-256-gcm',
    keyId,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptString(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid encrypted payload');
  }
  if (payload.alg !== 'aes-256-gcm') {
    throw new Error('Unsupported encryption algorithm');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

module.exports = {
  encryptString,
  decryptString,
};
