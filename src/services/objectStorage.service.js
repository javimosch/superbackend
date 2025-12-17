const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let s3Client = null;
let s3Config = null;

const getS3Config = () => {
  if (s3Config !== null) return s3Config;

  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;

  if (endpoint && accessKeyId && secretAccessKey && bucket) {
    s3Config = {
      endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      accessKeyId,
      secretAccessKey,
      bucket,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
    };
  } else {
    s3Config = false;
  }

  return s3Config;
};

const getS3Client = async () => {
  const config = getS3Config();
  if (!config) return null;

  if (s3Client) return s3Client;

  try {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      forcePathStyle: config.forcePathStyle
    });
    return s3Client;
  } catch (err) {
    console.warn('⚠️ @aws-sdk/client-s3 not installed, falling back to filesystem storage');
    s3Config = false;
    return null;
  }
};

const isS3Enabled = () => {
  return getS3Config() !== false;
};

const getProvider = () => {
  return isS3Enabled() ? 's3' : 'fs';
};

const getBucket = () => {
  const config = getS3Config();
  return config ? config.bucket : 'fs';
};

const getUploadDir = () => {
  return process.env.UPLOAD_DIR || 'uploads';
};

const getMaxFileSize = () => {
  return parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
};

const DEFAULT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'video/mp4',
  'video/webm'
];

const getAllowedContentTypes = () => {
  const envTypes = process.env.ALLOWED_CONTENT_TYPES;
  if (envTypes) {
    return envTypes.split(',').map(t => t.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_TYPES;
};

const validateContentType = (contentType) => {
  const allowed = getAllowedContentTypes();
  return allowed.includes(contentType);
};

const validateFileSize = (sizeBytes) => {
  return sizeBytes <= getMaxFileSize();
};

const generateKey = (originalName, prefix = 'assets') => {
  const ext = path.extname(originalName).toLowerCase();
  const hash = crypto.randomBytes(12).toString('hex');
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${prefix}/${year}/${month}/${hash}${ext}`;
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const putObject = async ({ key, body, contentType }) => {
  const client = await getS3Client();

  if (client) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const config = getS3Config();

    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    }));

    return { provider: 's3', bucket: config.bucket, key };
  }

  const uploadDir = getUploadDir();
  const filePath = path.join(process.cwd(), uploadDir, key);
  const dirPath = path.dirname(filePath);

  ensureDir(dirPath);
  fs.writeFileSync(filePath, body);

  return { provider: 'fs', bucket: 'fs', key };
};

const getObject = async ({ key }) => {
  const client = await getS3Client();

  if (client) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const config = getS3Config();

    const response = await client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: key
    }));

    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }

    return {
      body: Buffer.concat(chunks),
      contentType: response.ContentType
    };
  }

  const uploadDir = getUploadDir();
  const filePath = path.join(process.cwd(), uploadDir, key);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const body = fs.readFileSync(filePath);
  return { body, contentType: null };
};

const deleteObject = async ({ key }) => {
  const client = await getS3Client();

  if (client) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const config = getS3Config();

    await client.send(new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key
    }));

    return true;
  }

  const uploadDir = getUploadDir();
  const filePath = path.join(process.cwd(), uploadDir, key);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  return true;
};

const objectExists = async ({ key }) => {
  const client = await getS3Client();

  if (client) {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const config = getS3Config();

    try {
      await client.send(new HeadObjectCommand({
        Bucket: config.bucket,
        Key: key
      }));
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  const uploadDir = getUploadDir();
  const filePath = path.join(process.cwd(), uploadDir, key);
  return fs.existsSync(filePath);
};

module.exports = {
  isS3Enabled,
  getProvider,
  getBucket,
  getUploadDir,
  getMaxFileSize,
  getAllowedContentTypes,
  validateContentType,
  validateFileSize,
  generateKey,
  putObject,
  getObject,
  deleteObject,
  objectExists
};
