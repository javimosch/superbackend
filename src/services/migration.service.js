const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const GlobalSetting = require('../models/GlobalSetting');
const { encryptString, decryptString } = require('../utils/encryption');
const objectStorage = require('./objectStorage.service');
const migrationAssets = require('./migrationAssets');
const { createFsLocalEndpoint } = require('./migrationAssets/fsLocal');
const { createS3Endpoint } = require('./migrationAssets/s3');

const ENV_PREFIX = 'ENV_CONF_';

const connections = new Map();

function normalizeEnvKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return null;
  return raw.startsWith(ENV_PREFIX) ? raw : `${ENV_PREFIX}${raw}`;
}

function safeParseJson(str) {
  try {
    return JSON.parse(String(str));
  } catch (_) {
    return null;
  }
}

function redactConnectionString(conn) {
  const raw = String(conn || '').trim();
  if (!raw) return '';
  return raw.length <= 12 ? '********' : `${raw.slice(0, 6)}********${raw.slice(-4)}`;
}

async function listEnvironments() {
  const settings = await GlobalSetting.find({ key: { $regex: `^${ENV_PREFIX}` } })
    .sort({ key: 1 })
    .lean();

  const out = [];
  for (const s of settings) {
    try {
      if (s.type !== 'encrypted') continue;
      const payload = safeParseJson(s.value);
      const plaintext = payload ? decryptString(payload) : null;
      const cfg = plaintext ? safeParseJson(plaintext) : null;
      if (!cfg) continue;

      out.push({
        key: s.key,
        name: String(cfg.name || s.key.replace(ENV_PREFIX, '')),
        description: cfg.description ? String(cfg.description) : '',
        connectionStringMasked: redactConnectionString(cfg.connectionString),
        assetsTargetType: cfg?.assets?.target?.type ? String(cfg.assets.target.type) : '',
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
      });
    } catch (_) {
      // ignore
    }
  }

  return out;
}

async function getEnvironmentConfig(envKey) {
  const key = normalizeEnvKey(envKey);
  if (!key) return null;

  const setting = await GlobalSetting.findOne({ key }).lean();
  if (!setting) return null;
  if (setting.type !== 'encrypted') return null;

  const payload = safeParseJson(setting.value);
  const plaintext = payload ? decryptString(payload) : null;
  const cfg = plaintext ? safeParseJson(plaintext) : null;
  if (!cfg) return null;

  return {
    key,
    name: String(cfg.name || key.replace(ENV_PREFIX, '')),
    description: cfg.description ? String(cfg.description) : '',
    connectionString: String(cfg.connectionString || ''),
    assets: cfg?.assets && typeof cfg.assets === 'object' ? cfg.assets : undefined,
    // convenience alias for UIs
    assetsTarget: cfg?.assets?.target && typeof cfg.assets.target === 'object' ? cfg.assets.target : undefined,
  };
}

function normalizeAssetsTarget(target) {
  // Default to local filesystem if nothing provided
  if (!target || typeof target !== 'object') {
    return {
      type: 'fs_local',
      fs: {
        baseDir: process.env.UPLOAD_DIR || 'uploads',
      },
    };
  }
  const type = String(target.type || '').trim();
  if (!type) {
    return {
      type: 'fs_local',
      fs: {
        baseDir: process.env.UPLOAD_DIR || 'uploads',
      },
    };
  }

  if (type === 'fs_local') {
    const baseDir = target?.fs?.baseDir ? String(target.fs.baseDir).trim() : '';
    return {
      type,
      fs: {
        baseDir: baseDir || (process.env.UPLOAD_DIR || 'uploads'),
      },
    };
  }

  if (type === 'fs_remote') {
    const host = String(target?.ssh?.host || '').trim();
    const username = String(target?.ssh?.username || '').trim();
    const privateKeyPem = String(target?.ssh?.privateKeyPem || '').trim();
    const baseDir = String(target?.ssh?.baseDir || '').trim();
    const port = target?.ssh?.port ? Number(target.ssh.port) : 22;
    const passphrase = target?.ssh?.passphrase ? String(target.ssh.passphrase) : '';

    if (!host || !username || !privateKeyPem || !baseDir) {
      const err = new Error('Invalid fs_remote assets config (host, username, privateKeyPem, baseDir required)');
      err.status = 400;
      throw err;
    }

    return {
      type,
      ssh: {
        host,
        port,
        username,
        privateKeyPem,
        passphrase: passphrase || undefined,
        baseDir,
      },
    };
  }

  if (type === 's3') {
    const endpoint = String(target?.s3?.endpoint || '').trim();
    const region = String(target?.s3?.region || 'us-east-1').trim() || 'us-east-1';
    const bucket = String(target?.s3?.bucket || '').trim();
    const accessKeyId = String(target?.s3?.accessKeyId || '').trim();
    const secretAccessKey = String(target?.s3?.secretAccessKey || '').trim();
    const forcePathStyle = Boolean(target?.s3?.forcePathStyle);

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      const err = new Error('Invalid s3 assets config (endpoint, bucket, accessKeyId, secretAccessKey required)');
      err.status = 400;
      throw err;
    }

    return {
      type,
      s3: {
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey,
        forcePathStyle,
      },
    };
  }

  const err = new Error('Unsupported assets target type');
  err.status = 400;
  throw err;
}

async function upsertEnvironment(envKey, { name, connectionString, description, assetsTarget } = {}) {
  const key = normalizeEnvKey(envKey);
  if (!key) {
    const err = new Error('envKey is required');
    err.status = 400;
    throw err;
  }

  const safeName = String(name || key.replace(ENV_PREFIX, '')).trim();
  let safeConn = String(connectionString || '').trim();
  const safeDescription = description ? String(description).trim() : '';

  const normalizedAssetsTarget = normalizeAssetsTarget(assetsTarget);

  if (!safeConn) {
    // allow updating an existing env without re-sending the conn string
    const existing = await getEnvironmentConfig(key);
    if (existing?.connectionString) {
      safeConn = existing.connectionString;
    } else {
      const err = new Error('connectionString is required');
      err.status = 400;
      throw err;
    }
  }

  const payload = {
    name: safeName,
    connectionString: safeConn,
    description: safeDescription,
    assets: normalizedAssetsTarget ? { target: normalizedAssetsTarget } : undefined,
  };

  const encryptedPayload = encryptString(JSON.stringify(payload));
  const storedValue = JSON.stringify(encryptedPayload);

  const doc = await GlobalSetting.findOneAndUpdate(
    { key },
    {
      key,
      value: storedValue,
      type: 'encrypted',
      description: 'Migration environment config',
      public: false,
      templateVariables: [],
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    key: doc.key,
    name: safeName,
    description: safeDescription,
    connectionStringMasked: redactConnectionString(safeConn),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function deleteEnvironment(envKey) {
  const key = normalizeEnvKey(envKey);
  if (!key) {
    const err = new Error('envKey is required');
    err.status = 400;
    throw err;
  }

  const deleted = await GlobalSetting.findOneAndDelete({ key }).lean();
  if (!deleted) {
    const err = new Error('Environment not found');
    err.status = 404;
    throw err;
  }
  connections.delete(key);
  return { ok: true };
}

async function getSettingValueFromConn(conn, key, defaultValue = null) {
  if (!conn) return defaultValue;
  const Model = conn.model('GlobalSetting', GlobalSetting.schema);
  const doc = await Model.findOne({ key }).lean();
  if (!doc) return defaultValue;
  if (doc.type !== 'encrypted') return doc.value;
  const payload = safeParseJson(doc.value);
  if (!payload) return defaultValue;
  try {
    return decryptString(payload);
  } catch (_) {
    return defaultValue;
  }
}

async function resolveTargetStorage(targetConn) {
  const backendRaw = await getSettingValueFromConn(targetConn, 'STORAGE_BACKEND', null);
  const backend = String(backendRaw || '').trim().toLowerCase();

  const s3ConfigRaw = await getSettingValueFromConn(targetConn, 'STORAGE_S3_CONFIG', null);
  const parsedS3 = s3ConfigRaw ? safeParseJson(String(s3ConfigRaw)) : null;
  const validS3 = parsedS3
    && typeof parsedS3 === 'object'
    && String(parsedS3.endpoint || '').trim()
    && String(parsedS3.accessKeyId || '').trim()
    && String(parsedS3.secretAccessKey || '').trim()
    && String(parsedS3.bucket || '').trim();

  if (backend === 's3') {
    return { backend: 's3', s3: validS3 ? parsedS3 : null };
  }
  if (backend === 'fs') {
    return { backend: 'fs', s3: null };
  }

  if (validS3) {
    return { backend: 's3', s3: parsedS3 };
  }

  return { backend: 'fs', s3: null };
}

async function resolveTargetAssetEndpoint(targetEnvKey) {
  const envCfg = await getEnvironmentConfig(targetEnvKey);
  const fromEnv = await migrationAssets.resolveTargetEndpointFromEnvConfig(envCfg);
  if (fromEnv) return fromEnv;

  const targetConn = await getTargetConnection(targetEnvKey);
  const targetStorage = await resolveTargetStorage(targetConn);
  if (targetStorage.backend === 's3' && targetStorage.s3) {
    return createS3Endpoint(targetStorage.s3);
  }
  return createFsLocalEndpoint({ baseDir: process.env.UPLOAD_DIR || 'uploads' });
}

async function testAssetsTarget({ targetEnvKey } = {}) {
  if (!targetEnvKey) {
    const err = new Error('targetEnvKey is required');
    err.status = 400;
    throw err;
  }
  const endpoint = await resolveTargetAssetEndpoint(targetEnvKey);
  const result = await endpoint.testWritable();
  return { ok: true, endpointType: endpoint.type, result };
}

async function testAssetsCopyKey({ targetEnvKey, key, dryRun = false } = {}) {
  const safeKey = String(key || '').trim();
  if (!targetEnvKey) {
    const err = new Error('targetEnvKey is required');
    err.status = 400;
    throw err;
  }
  if (!safeKey) {
    const err = new Error('key is required');
    err.status = 400;
    throw err;
  }

  const sourceEndpoint = await migrationAssets.resolveSourceEndpoint();
  const targetEndpoint = await resolveTargetAssetEndpoint(targetEnvKey);
  const copy = await migrationAssets.copyKeys({
    keys: [safeKey],
    sourceEndpoint,
    targetEndpoint,
    dryRun: !!dryRun,
    batchSize: 1,
  });
  return { ok: copy.ok, copy };
}

async function copyAssetKeys({ targetEnvKey, keys, dryRun = false, batchSize = 10 } = {}) {
  if (!targetEnvKey) {
    const err = new Error('targetEnvKey is required');
    err.status = 400;
    throw err;
  }
  const list = Array.isArray(keys) ? keys.map((k) => String(k || '').trim()).filter(Boolean) : [];
  if (!list.length) {
    const err = new Error('keys must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const sourceEndpoint = await migrationAssets.resolveSourceEndpoint();
  const targetEndpoint = await resolveTargetAssetEndpoint(targetEnvKey);
  return migrationAssets.copyKeys({ keys: list, sourceEndpoint, targetEndpoint, dryRun: !!dryRun, batchSize });
}

function getUploadDir() {
  return process.env.UPLOAD_DIR || 'uploads';
}

function buildFsPath(key) {
  return path.join(process.cwd(), getUploadDir(), key);
}

async function putObjectToTarget({ targetStorage, key, body, contentType }) {
  if (targetStorage.backend === 'fs') {
    const filePath = buildFsPath(key);
    const dirPath = path.dirname(filePath);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, body);
    return { provider: 'fs', bucket: 'fs', key };
  }

  if (targetStorage.backend === 's3') {
    const cfg = targetStorage.s3;
    if (!cfg) {
      const err = new Error('Target S3 is not configured');
      err.code = 'S3_NOT_CONFIGURED';
      throw err;
    }

    const { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region || 'us-east-1',
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: Boolean(cfg.forcePathStyle),
    });

    try {
      await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    } catch (e) {
      const status = e?.$metadata?.httpStatusCode;
      if (status === 404 || e?.name === 'NotFound') {
        await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
      } else {
        throw e;
      }
    }

    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || undefined,
    }));

    return { provider: 's3', bucket: cfg.bucket, key };
  }

  const err = new Error('Unsupported target storage backend');
  err.code = 'UNSUPPORTED_BACKEND';
  throw err;
}

async function copyAssetObjects({ assetDocs, targetEnvKey, batchSize = 20, dryRun = false } = {}) {
  const docs = Array.isArray(assetDocs) ? assetDocs : [];
  const keys = docs.map((d) => String(d?.key || '').trim()).filter(Boolean);
  return copyAssetKeys({ targetEnvKey, keys, dryRun: !!dryRun, batchSize });
}

async function getTargetConnection(envKey) {
  const normalizedKey = normalizeEnvKey(envKey);
  if (!normalizedKey) {
    const err = new Error('envKey is required');
    err.status = 400;
    throw err;
  }

  const cached = connections.get(normalizedKey);
  if (cached && cached.readyState === 1) return cached;

  const cfg = await getEnvironmentConfig(normalizedKey);
  if (!cfg?.connectionString) {
    const err = new Error('Target environment not configured');
    err.status = 400;
    throw err;
  }

  const conn = mongoose.createConnection(cfg.connectionString, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 5,
  });

  await conn.asPromise();
  connections.set(normalizedKey, conn);
  return conn;
}

async function testConnection(envKey) {
  const conn = await getTargetConnection(envKey);
  try {
    await conn.db.admin().ping();
  } catch (_) {
    await conn.close().catch(() => {});
    connections.delete(normalizeEnvKey(envKey));
    throw _;
  }

  return { ok: true };
}

async function migrateModel({
  sourceModel,
  targetEnvKey,
  query,
  modelName,
  batchSize = 200,
  dryRun = false,
} = {}) {
  if (!sourceModel || !sourceModel.schema) {
    const err = new Error('sourceModel is required');
    err.status = 400;
    throw err;
  }

  const safeModelName = String(modelName || sourceModel.modelName || '').trim();
  if (!safeModelName) {
    const err = new Error('modelName is required');
    err.status = 400;
    throw err;
  }

  const targetConn = await getTargetConnection(targetEnvKey);
  const TargetModel = targetConn.models[safeModelName]
    || targetConn.model(safeModelName, sourceModel.schema);

  const filter = query && typeof query === 'object' ? query : {};

  const total = await sourceModel.countDocuments(filter);
  const result = {
    ok: true,
    modelName: safeModelName,
    total,
    processed: 0,
    upserted: 0,
    errors: [],
    dryRun: !!dryRun,
  };

  const cursor = sourceModel.find(filter).lean().cursor();

  let batch = [];
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= batchSize) {
      const r = await flushBatch(TargetModel, batch, { dryRun });
      result.processed += r.processed;
      result.upserted += r.upserted;
      result.errors.push(...r.errors);
      batch = [];
    }
  }

  if (batch.length) {
    const r = await flushBatch(TargetModel, batch, { dryRun });
    result.processed += r.processed;
    result.upserted += r.upserted;
    result.errors.push(...r.errors);
  }

  if (result.errors.length) {
    result.ok = false;
  }

  return result;
}

async function flushBatch(TargetModel, docs, { dryRun } = {}) {
  const result = { processed: docs.length, upserted: 0, errors: [] };
  if (dryRun) {
    result.upserted = docs.length;
    return result;
  }

  const ops = docs.map((d) => {
    const id = d._id;
    const copy = { ...d };
    delete copy.__v;
    return {
      replaceOne: {
        filter: { _id: id },
        replacement: copy,
        upsert: true,
      },
    };
  });

  try {
    const res = await TargetModel.bulkWrite(ops, { ordered: false });
    result.upserted = (res?.upsertedCount || 0) + (res?.modifiedCount || 0) + (res?.insertedCount || 0);
  } catch (e) {
    result.errors.push({ error: e?.message ? String(e.message) : 'bulkWrite failed' });
  }

  return result;
}

module.exports = {
  ENV_PREFIX,
  listEnvironments,
  getEnvironmentConfig,
  upsertEnvironment,
  deleteEnvironment,
  testConnection,
  testAssetsTarget,
  testAssetsCopyKey,
  getTargetConnection,
  migrateModel,
  copyAssetKeys,
  copyAssetObjects,
};
