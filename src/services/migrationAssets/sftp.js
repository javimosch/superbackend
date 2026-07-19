const path = require('path');

async function createSftpEndpoint({ host, port, username, privateKeyPem, passphrase, baseDir } = {}) {
  const safeHost = String(host || '').trim();
  const safeUser = String(username || '').trim();
  const safeKey = String(privateKeyPem || '').trim();
  const safeBaseDir = String(baseDir || '').trim();

  if (!safeHost || !safeUser || !safeKey || !safeBaseDir) {
    const err = new Error('Invalid SFTP endpoint config');
    err.code = 'INVALID_SFTP_CONFIG';
    throw err;
  }

  const SftpClient = require('ssh2-sftp-client');
  const client = new SftpClient();

  const config = {
    host: safeHost,
    port: Number(port) || 22,
    username: safeUser,
    privateKey: safeKey,
    passphrase: passphrase ? String(passphrase) : undefined,
  };

  async function connect() {
    await client.connect(config);
  }

  async function end() {
    try {
      await client.end();
    } catch (e) {
      console.error('[migration:sftp] Failed to close SFTP client:', e?.message || e);
    }
  }

  function remotePath(key) {
    return path.posix.join(safeBaseDir.replace(/\\/g, '/'), String(key || '').replace(/\\/g, '/'));
  }

  return {
    type: 'fs_remote',
    host: safeHost,
    username: safeUser,
    baseDir: safeBaseDir,

    async testWritable() {
      await connect();
      try {
        await client.mkdir(safeBaseDir, true);
        const testKey = `.__migration_test__${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const p = path.posix.join(safeBaseDir.replace(/\\/g, '/'), testKey);
        await client.put(Buffer.from('ok'), p);
        await client.delete(p);
        return { ok: true, host: safeHost, baseDir: safeBaseDir };
      } finally {
        await end();
      }
    },

    async getObject({ key }) {
      await connect();
      try {
        const buf = await client.get(remotePath(key));
        const body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        return { body, contentType: null };
      } finally {
        await end();
      }
    },

    async putObject({ key, body }) {
      await connect();
      try {
        await client.mkdir(path.posix.dirname(remotePath(key)), true);
        await client.put(body, remotePath(key));
        return { ok: true, key };
      } finally {
        await end();
      }
    },

    describeKey(key) {
      return remotePath(key);
    },
  };
}

module.exports = {
  createSftpEndpoint,
};
