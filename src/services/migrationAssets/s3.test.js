const { createS3Endpoint } = require('./s3');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const mockS3Client = {
  send: jest.fn()
};

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn(() => mockS3Client),
    HeadBucketCommand: jest.fn(),
    CreateBucketCommand: jest.fn(),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn()
  };
});

describe('migrationAssets/s3', () => {
  const mockConfig = {
    endpoint: 'http://localhost:9000',
    bucket: 'test-bucket',
    accessKeyId: 'key',
    secretAccessKey: 'secret'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockS3Client.send.mockResolvedValue({ ok: true });
  });

  describe('createS3Endpoint', () => {
    test('throws error for invalid config', async () => {
      await expect(createS3Endpoint({})).rejects.toThrow('Invalid S3 endpoint config');
    });

    test('returns endpoint with correct properties', async () => {
      const endpoint = await createS3Endpoint(mockConfig);
      expect(endpoint.type).toBe('s3');
      expect(endpoint.endpoint).toBe(mockConfig.endpoint);
      expect(endpoint.bucket).toBe(mockConfig.bucket);
    });

    test('describeKey returns s3 URI', async () => {
      const endpoint = await createS3Endpoint(mockConfig);
      expect(endpoint.describeKey('test.txt')).toBe('s3://test-bucket/test.txt');
    });

    test('testWritable sends commands to S3', async () => {
      const endpoint = await createS3Endpoint(mockConfig);
      
      const result = await endpoint.testWritable();
      
      expect(result.ok).toBe(true);
      expect(mockS3Client.send).toHaveBeenCalled();
    });

    test('putObject sends PutObjectCommand', async () => {
      const endpoint = await createS3Endpoint(mockConfig);

      const result = await endpoint.putObject({ key: 'test.txt', body: Buffer.from('data') });
      
      expect(result.ok).toBe(true);
      expect(mockS3Client.send).toHaveBeenCalled();
      expect(PutObjectCommand).toHaveBeenCalled();
    });
  });
});
