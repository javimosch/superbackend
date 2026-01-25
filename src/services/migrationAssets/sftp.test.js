const { createSftpEndpoint } = require('./sftp');

jest.mock('ssh2-sftp-client', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(true),
    end: jest.fn().mockResolvedValue(true),
    mkdir: jest.fn().mockResolvedValue(true),
    put: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(Buffer.from('ok')),
    delete: jest.fn().mockResolvedValue(true)
  }));
});

describe('migrationAssets/sftp', () => {
  const mockConfig = {
    host: 'localhost',
    port: 22,
    username: 'user',
    privateKeyPem: 'key',
    baseDir: '/remote/dir'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSftpEndpoint', () => {
    test('throws error for invalid config', async () => {
      await expect(createSftpEndpoint({})).rejects.toThrow('Invalid SFTP endpoint config');
    });

    test('returns endpoint with correct properties', async () => {
      const endpoint = await createSftpEndpoint(mockConfig);
      expect(endpoint.type).toBe('fs_remote');
      expect(endpoint.host).toBe(mockConfig.host);
      expect(endpoint.username).toBe(mockConfig.username);
      expect(endpoint.baseDir).toBe(mockConfig.baseDir);
    });

    test('describeKey returns remote path', async () => {
      const endpoint = await createSftpEndpoint(mockConfig);
      expect(endpoint.describeKey('test.txt')).toBe('/remote/dir/test.txt');
    });

    test('testWritable performs SFTP operations', async () => {
      const endpoint = await createSftpEndpoint(mockConfig);
      const result = await endpoint.testWritable();
      expect(result.ok).toBe(true);
    });

    test('getObject returns file content', async () => {
      const endpoint = await createSftpEndpoint(mockConfig);
      const result = await endpoint.getObject({ key: 'test.txt' });
      expect(result.body.toString()).toBe('ok');
    });

    test('putObject writes file content', async () => {
      const endpoint = await createSftpEndpoint(mockConfig);
      const result = await endpoint.putObject({ key: 'test.txt', body: Buffer.from('data') });
      expect(result.ok).toBe(true);
    });
  });
});
