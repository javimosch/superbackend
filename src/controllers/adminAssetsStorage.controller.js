const GlobalSetting = require('../models/GlobalSetting');
const Asset = require('../models/Asset');
const { encryptString } = require('../utils/encryption');
const globalSettingsService = require('../services/globalSettings.service');
const objectStorage = require('../services/objectStorage.service');

const STORAGE_BACKEND_SETTING_KEY = 'STORAGE_BACKEND';
const STORAGE_S3_CONFIG_SETTING_KEY = 'STORAGE_S3_CONFIG';

const maskS3Config = (cfg) => {
  if (!cfg) return null;
  return {
    endpoint: cfg.endpoint,
    region: cfg.region,
    bucket: cfg.bucket,
    forcePathStyle: Boolean(cfg.forcePathStyle),
    accessKeyId: cfg.accessKeyId ? '********' : '',
    secretAccessKey: cfg.secretAccessKey ? '********' : '',
  };
};

const upsertSetting = async ({ key, value, type, description }) => {
  const existing = await GlobalSetting.findOne({ key });
  if (existing) {
    existing.type = type;
    existing.description = description;
    existing.public = false;
    existing.value = value;
    await existing.save();
    return existing.toObject();
  }

  const created = await GlobalSetting.create({
    key,
    value,
    type,
    description,
    public: false,
  });
  return created.toObject();
};

exports.getStorageStatus = async (req, res) => {
  try {
    const [activeBackend, s3Config] = await Promise.all([
      objectStorage.getActiveBackend(),
      objectStorage.getS3Config(),
    ]);

    res.json({
      activeBackend,
      s3: {
        configured: Boolean(s3Config),
        config: s3Config ? maskS3Config(s3Config) : null,
      },
    });
  } catch (error) {
    console.error('Error getting storage status:', error);
    res.status(500).json({ error: 'Failed to get storage status' });
  }
};

exports.saveS3Config = async (req, res) => {
  try {
    const normalizeBlank = (v) => {
      const s = v === undefined || v === null ? '' : String(v);
      const trimmed = s.trim();
      return trimmed ? trimmed : undefined;
    };

    const existing = await objectStorage.getS3Config();

    const candidate = {
      endpoint: normalizeBlank(req.body?.endpoint) ?? existing?.endpoint,
      region: normalizeBlank(req.body?.region) ?? existing?.region,
      bucket: normalizeBlank(req.body?.bucket) ?? existing?.bucket,
      accessKeyId: normalizeBlank(req.body?.accessKeyId) ?? existing?.accessKeyId,
      secretAccessKey: normalizeBlank(req.body?.secretAccessKey) ?? existing?.secretAccessKey,
      forcePathStyle: req.body?.forcePathStyle ?? existing?.forcePathStyle,
    };

    const validated = objectStorage.validateS3Config(candidate);
    if (!validated) {
      return res.status(400).json({ error: 'Invalid S3 config. Required: endpoint, accessKeyId, secretAccessKey, bucket.' });
    }

    const encryptedPayload = encryptString(JSON.stringify(validated));
    await upsertSetting({
      key: STORAGE_S3_CONFIG_SETTING_KEY,
      type: 'encrypted',
      value: JSON.stringify(encryptedPayload),
      description: 'S3 storage configuration (encrypted)'
    });

    globalSettingsService.clearSettingsCache();
    objectStorage.clearStorageConfigCache();

    res.json({
      ok: true,
      s3: {
        configured: true,
        config: maskS3Config(validated),
      },
    });
  } catch (error) {
    console.error('Error saving S3 config:', error);
    res.status(500).json({ error: 'Failed to save S3 config' });
  }
};

exports.checkS3Connection = async (req, res) => {
  try {
    const result = await objectStorage.checkS3Connection();
    res.json({ ok: true, result });
  } catch (error) {
    console.error('Error checking S3 connection:', error);
    res.status(400).json({ ok: false, error: error.message || 'S3 check failed', code: error.code || 'S3_CHECK_FAILED' });
  }
};

const normalizeDirection = (dir) => {
  const v = String(dir || '').trim().toLowerCase();
  if (v === 'fs-to-s3' || v === 's3-to-fs') return v;
  return null;
};

exports.sync = async (req, res) => {
  try {
    const direction = normalizeDirection(req.body?.direction);
    if (!direction) {
      return res.status(400).json({ error: 'Invalid direction. Use fs-to-s3 or s3-to-fs.' });
    }

    const limit = Math.min(500, Math.max(1, Number(req.body?.limit) || 100));
    const cursor = req.body?.cursor ? String(req.body.cursor) : null;

    const sourceBackend = direction === 'fs-to-s3' ? 'fs' : 's3';
    const destBackend = direction === 'fs-to-s3' ? 's3' : 'fs';

    const s3Cfg = await objectStorage.getS3Config();
    if ((sourceBackend === 's3' || destBackend === 's3') && !s3Cfg) {
      return res.status(400).json({ error: 'S3 is not configured' });
    }

    const expectedSourceProvider = sourceBackend;
    const expectedSourceBucket = sourceBackend === 's3' ? s3Cfg.bucket : 'fs';

    const filter = { status: 'uploaded' };
    if (cursor) {
      filter._id = { $gt: cursor };
    }

    const assets = await Asset.find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .lean();

    const stats = {
      direction,
      sourceBackend,
      destBackend,
      scanned: 0,
      copied: 0,
      skippedMissingSource: 0,
      skippedAlreadySynced: 0,
      skippedDifferentBytes: 0,
      aborted: false,
      abortReason: null,
      nextCursor: null,
    };

    for (const asset of assets) {
      stats.scanned += 1;
      stats.nextCursor = String(asset._id);

      if (asset.provider !== expectedSourceProvider) {
        // Asset does not belong to the selected source backend; treat as missing from source.
        stats.skippedMissingSource += 1;
        continue;
      }

      if (asset.bucket !== expectedSourceBucket) {
        // Asset claims it is in the source backend, but points to a different bucket.
        // This is a dangerous mismatch, so abort.
        stats.aborted = true;
        stats.abortReason = {
          reason: 'asset provider/bucket mismatch',
          assetId: String(asset._id),
          key: asset.key,
          actual: { provider: asset.provider, bucket: asset.bucket },
          expected: { provider: expectedSourceProvider, bucket: expectedSourceBucket },
        };
        return res.status(409).json({ error: 'Sync aborted: provider/bucket mismatch', details: stats.abortReason, stats });
      }

      const sourceExists = await objectStorage.objectExists({ key: asset.key, backend: sourceBackend });
      if (!sourceExists) {
        stats.skippedMissingSource += 1;
        continue;
      }

      const destExists = await objectStorage.objectExists({ key: asset.key, backend: destBackend });
      if (destExists) {
        const cmp = await objectStorage.compareObjectBytes({ key: asset.key, sourceBackend, destBackend });
        if (!cmp.comparable) {
          stats.skippedDifferentBytes += 1;
          continue;
        }
        if (cmp.same) {
          stats.skippedAlreadySynced += 1;
        } else {
          stats.skippedDifferentBytes += 1;
        }
        continue;
      }

      const obj = await objectStorage.getObject({ key: asset.key, backend: sourceBackend });
      if (!obj || !obj.body) {
        stats.skippedMissingSource += 1;
        continue;
      }

      await objectStorage.putObject({
        key: asset.key,
        body: obj.body,
        contentType: asset.contentType,
        backend: destBackend,
      });

      stats.copied += 1;
    }

    res.json({ ok: true, stats });
  } catch (error) {
    console.error('Error syncing storage:', error);
    res.status(500).json({ error: 'Failed to sync storage', details: error.message });
  }
};

exports.switchBackend = async (req, res) => {
  try {
    const backend = String(req.body?.backend || '').trim().toLowerCase();
    if (backend !== 'fs' && backend !== 's3') {
      return res.status(400).json({ error: 'Invalid backend. Use fs or s3.' });
    }

    if (backend === 's3') {
      await objectStorage.checkS3Connection();
    }

    await upsertSetting({
      key: STORAGE_BACKEND_SETTING_KEY,
      type: 'string',
      value: backend,
      description: 'Active object storage backend (fs or s3)'
    });

    globalSettingsService.clearSettingsCache();
    objectStorage.clearStorageConfigCache();

    res.json({ ok: true, activeBackend: backend });
  } catch (error) {
    console.error('Error switching backend:', error);
    res.status(400).json({ error: error.message || 'Failed to switch backend' });
  }
};
