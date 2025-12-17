const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const globalSettingsService = require('./globalSettings.service');

let s3Client = null;
let s3Config = null;

let ensuredBucketCache = null;

let activeBackendCache = null;

const STORAGE_BACKEND_SETTING_KEY = 'STORAGE_BACKEND';
const STORAGE_S3_CONFIG_SETTING_KEY = 'STORAGE_S3_CONFIG';

const getEnvS3Config = () => {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    endpoint,
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
  };
};

const validateS3Config = (cfg) => {
  if (!cfg || typeof cfg !== 'object') return null;

  const endpoint = String(cfg.endpoint || '').trim();
  const region = String(cfg.region || 'us-east-1').trim() || 'us-east-1';
  const accessKeyId = String(cfg.accessKeyId || '').trim();
  const secretAccessKey = String(cfg.secretAccessKey || '').trim();
  const bucket = String(cfg.bucket || '').trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: Boolean(cfg.forcePathStyle),
  };
};

const getS3Config = async () => {
  if (s3Config !== null) return s3Config;

  const raw = await globalSettingsService.getSettingValue(STORAGE_S3_CONFIG_SETTING_KEY, null);
  if (raw) {
    try {
      const parsed = JSON.parse(String(raw));
      const validated = validateS3Config(parsed);
      s3Config = validated || false;
      return s3Config;
    } catch (e) {
      s3Config = false;
      return s3Config;
    }
  }

  const envCfg = getEnvS3Config();
  s3Config = envCfg ? validateS3Config(envCfg) : false;
  return s3Config;
};

const getS3Client = async () => {
  const config = await getS3Config();
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

const getActiveBackend = async () => {
  if (activeBackendCache) return activeBackendCache;
  const fromSetting = await globalSettingsService.getSettingValue(STORAGE_BACKEND_SETTING_KEY, null);
  const normalized = String(fromSetting || '').trim().toLowerCase();
  if (normalized === 'fs' || normalized === 's3') {
    activeBackendCache = normalized;
    return activeBackendCache;
  }

  const cfg = await getS3Config();
  activeBackendCache = cfg ? 's3' : 'fs';
  return activeBackendCache;
};

const clearStorageConfigCache = () => {
  s3Client = null;
  s3Config = null;
  activeBackendCache = null;
  ensuredBucketCache = null;
};

const ensureS3BucketExists = async () => {
  const cfg = await getS3Config();
  if (!cfg) {
    const err = new Error('S3 is not configured');
    err.code = 'S3_NOT_CONFIGURED';
    throw err;
  }

  const cacheKey = `${cfg.endpoint}::${cfg.region}::${cfg.bucket}`;
  if (ensuredBucketCache === cacheKey) {
    return { ok: true, bucket: cfg.bucket, ensured: true };
  }

  const client = await getS3Client();
  if (!client) {
    const err = new Error('S3 client not available');
    err.code = 'S3_CLIENT_NOT_AVAILABLE';
    throw err;
  }

  const { HeadBucketCommand, CreateBucketCommand } = await import('@aws-sdk/client-s3');

  try {
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    ensuredBucketCache = cacheKey;
    return { ok: true, bucket: cfg.bucket, ensured: false };
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    const name = err?.name;
    if (status !== 404 && name !== 'NotFound') {
      throw err;
    }

    try {
      await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
    } catch (createErr) {
      const createName = createErr?.name;
      const createCode = createErr?.Code || createErr?.code;
      const createStatus = createErr?.$metadata?.httpStatusCode;
      if (
        createName === 'BucketAlreadyOwnedByYou' ||
        createName === 'BucketAlreadyExists' ||
        createCode === 'BucketAlreadyOwnedByYou' ||
        createCode === 'BucketAlreadyExists' ||
        createStatus === 409
      ) {
        // ok
      } else {
        throw createErr;
      }
    }

    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    ensuredBucketCache = cacheKey;
    return { ok: true, bucket: cfg.bucket, ensured: true };
  }
};

const isS3Enabled = async () => {
  return (await getS3Config()) !== false;
};

const getProvider = async () => {
  return getActiveBackend();
};

const getBucket = async () => {
  const backend = await getActiveBackend();
  if (backend !== 's3') return 'fs';
  const cfg = await getS3Config();
  return cfg ? cfg.bucket : 'fs';
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

const sha256 = (buf) => {
  return crypto.createHash('sha256').update(buf).digest('hex');
};

const buildFsPath = (key) => {
  const uploadDir = getUploadDir();
  return path.join(process.cwd(), uploadDir, key);
};

const putObjectFs = async ({ key, body }) => {
  const filePath = buildFsPath(key);
  const dirPath = path.dirname(filePath);
  ensureDir(dirPath);
  fs.writeFileSync(filePath, body);
  return { provider: 'fs', bucket: 'fs', key };
};

const getObjectFs = async ({ key }) => {
  const filePath = buildFsPath(key);
  if (!fs.existsSync(filePath)) return null;
  const body = fs.readFileSync(filePath);
  return { body, contentType: null };
};

const deleteObjectFs = async ({ key }) => {
  const filePath = buildFsPath(key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return true;
};

const objectExistsFs = async ({ key }) => {
  const filePath = buildFsPath(key);
  return fs.existsSync(filePath);
};

const putObjectS3 = async ({ key, body, contentType }) => {
  const client = await getS3Client();
  if (!client) {
    const err = new Error('S3 is not configured');
    err.code = 'S3_NOT_CONFIGURED';
    throw err;
  }
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const config = await getS3Config();

  await ensureS3BucketExists();

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
  return { provider: 's3', bucket: config.bucket, key };
};

const getObjectS3 = async ({ key }) => {
  const client = await getS3Client();
  if (!client) return null;
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const config = await getS3Config();

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
};

const deleteObjectS3 = async ({ key }) => {
  const client = await getS3Client();
  if (!client) return true;
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const config = await getS3Config();
  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: key
  }));
  return true;
};

const objectExistsS3 = async ({ key }) => {
  const client = await getS3Client();
  if (!client) return false;
  const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const config = await getS3Config();

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
};

const putObject = async ({ key, body, contentType, backend }) => {
  const target = backend || await getActiveBackend();
  if (target === 's3') {
    return putObjectS3({ key, body, contentType });
  }
  return putObjectFs({ key, body });
};

const getObject = async ({ key, backend }) => {
  const target = backend || await getActiveBackend();
  if (target === 's3') {
    return getObjectS3({ key });
  }
  return getObjectFs({ key });
};

const deleteObject = async ({ key, backend }) => {
  const target = backend || await getActiveBackend();
  if (target === 's3') {
    return deleteObjectS3({ key });
  }
  return deleteObjectFs({ key });
};

const objectExists = async ({ key, backend }) => {
  const target = backend || await getActiveBackend();
  if (target === 's3') {
    return objectExistsS3({ key });
  }
  return objectExistsFs({ key });
};

const checkS3Connection = async () => {
  const cfg = await getS3Config();
  if (!cfg) {
    const err = new Error('S3 is not configured');
    err.code = 'S3_NOT_CONFIGURED';
    throw err;
  }

  const client = await getS3Client();
  if (!client) {
    const err = new Error('S3 client not available');
    err.code = 'S3_CLIENT_NOT_AVAILABLE';
    throw err;
  }

  try {
    const ensured = await ensureS3BucketExists();
    return {
      ok: true,
      bucket: cfg.bucket,
      region: cfg.region,
      endpoint: cfg.endpoint,
      ensuredBucket: Boolean(ensured?.ensured),
    };
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    const name = err?.name;
    const e = new Error(err?.message ? String(err.message) : 'S3 check failed');
    e.code = err?.code || 'S3_CHECK_FAILED';
    e.details = err?.details || { status, name, bucket: cfg.bucket, endpoint: cfg.endpoint, region: cfg.region };
    throw e;
  }
};

const compareObjectBytes = async ({ key, sourceBackend, destBackend }) => {
  const [src, dst] = await Promise.all([
    getObject({ key, backend: sourceBackend }),
    getObject({ key, backend: destBackend }),
  ]);

  if (!src || !dst) {
    return { comparable: false, same: false };
  }

  if (src.body.length !== dst.body.length) {
    return { comparable: true, same: false };
  }

  return { comparable: true, same: sha256(src.body) === sha256(dst.body) };
};

module.exports = {
  isS3Enabled,
  getProvider,
  getBucket,
  getActiveBackend,
  clearStorageConfigCache,
  getS3Config,
  validateS3Config,
  checkS3Connection,
  compareObjectBytes,
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
