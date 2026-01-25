const objectStorage = require('../objectStorage.service');
const migrationAssets = require('./index');
const { createFsLocalEndpoint } = require('./fsLocal');
const { createS3Endpoint } = require('./s3');
const { createSftpEndpoint } = require('./sftp');

jest.mock('../objectStorage.service');
jest.mock('./fsLocal');
jest.mock('./s3');
jest.mock('./sftp');

describe('migrationAssets/index.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPLOAD_DIR = 'uploads';
  });

  describe('resolveSourceEndpoint', () => {
    test('resolves to S3 if active backend is s3', async () => {
      objectStorage.getActiveBackend.mockResolvedValue('s3');
      const mockS3Config = { bucket: 'test-bucket' };
      objectStorage.getS3Config.mockResolvedValue(mockS3Config);
      createS3Endpoint.mockReturnValue({ type: 's3' });

      const endpoint = await migrationAssets.resolveSourceEndpoint();

      expect(createS3Endpoint).toHaveBeenCalledWith(mockS3Config);
      expect(endpoint.type).toBe('s3');
    });

    test('resolves to FS if active backend is fs', async () => {
      objectStorage.getActiveBackend.mockResolvedValue('fs');
      createFsLocalEndpoint.mockReturnValue({ type: 'fs_local' });

      const endpoint = await migrationAssets.resolveSourceEndpoint();

      expect(createFsLocalEndpoint).toHaveBeenCalled();
      expect(endpoint.type).toBe('fs_local');
    });

    test('throws error if S3 config is missing when active', async () => {
      objectStorage.getActiveBackend.mockResolvedValue('s3');
      objectStorage.getS3Config.mockResolvedValue(null);

      await expect(migrationAssets.resolveSourceEndpoint()).rejects.toThrow('Source S3 is not configured');
    });
  });

  describe('resolveTargetEndpointFromEnvConfig', () => {
    test('resolves fs_local target', async () => {
      const envCfg = {
        assets: {
          target: { type: 'fs_local', fs: { baseDir: 'custom' } }
        }
      };
      createFsLocalEndpoint.mockReturnValue({ type: 'fs_local' });

      const endpoint = await migrationAssets.resolveTargetEndpointFromEnvConfig(envCfg);

      expect(createFsLocalEndpoint).toHaveBeenCalledWith({ baseDir: 'custom' });
      expect(endpoint.type).toBe('fs_local');
    });

    test('resolves s3 target', async () => {
      const envCfg = {
        assets: {
          target: {
            type: 's3',
            s3: { endpoint: 'http://minio', bucket: 'test' }
          }
        }
      };
      createS3Endpoint.mockReturnValue({ type: 's3' });

      const endpoint = await migrationAssets.resolveTargetEndpointFromEnvConfig(envCfg);

      expect(createS3Endpoint).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'test' }));
      expect(endpoint.type).toBe('s3');
    });

    test('returns null if no target in config', async () => {
      const endpoint = await migrationAssets.resolveTargetEndpointFromEnvConfig({});
      expect(endpoint).toBeNull();
    });
  });

  describe('copyKeys', () => {
    test('copies keys between endpoints', async () => {
      const source = {
        type: 'fs_local',
        getObject: jest.fn().mockResolvedValue({ body: Buffer.from('data'), contentType: 'text/plain' }),
        describeKey: (k) => `src/${k}`
      };
      const target = {
        type: 's3',
        putObject: jest.fn().mockResolvedValue({ ok: true }),
        describeKey: (k) => `dst/${k}`
      };

      const result = await migrationAssets.copyKeys({
        keys: ['file1.txt'],
        sourceEndpoint: source,
        targetEndpoint: target
      });

      expect(result.ok).toBe(true);
      expect(result.copied).toBe(1);
      expect(target.putObject).toHaveBeenCalledWith({
        key: 'file1.txt',
        body: expect.any(Buffer),
        contentType: 'text/plain'
      });
    });

    test('handles missing source objects', async () => {
      const source = { getObject: jest.fn().mockResolvedValue(null) };
      const target = { putObject: jest.fn() };

      const result = await migrationAssets.copyKeys({
        keys: ['missing.txt'],
        sourceEndpoint: source,
        targetEndpoint: target
      });

      expect(result.ok).toBe(false);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Source object not found');
    });

    test('respects dryRun mode', async () => {
      const source = { getObject: jest.fn().mockResolvedValue({ body: Buffer.from('exists') }) };
      const target = { putObject: jest.fn() };

      const result = await migrationAssets.copyKeys({
        keys: ['file.txt'],
        sourceEndpoint: source,
        targetEndpoint: target,
        dryRun: true
      });

      expect(result.skipped).toBe(1);
      expect(target.putObject).not.toHaveBeenCalled();
    });
  });
});
