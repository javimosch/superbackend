const Asset = require('../models/Asset');
const objectStorage = require('../services/objectStorage.service');
const uploadNamespacesService = require('../services/uploadNamespaces.service');

const buildPublicUrl = (key) => {
  return `/public/assets/${key}`;
};

const formatAssetResponse = (asset) => {
  const obj = asset.toObject ? asset.toObject() : asset;
  const response = {
    _id: obj._id,
    key: obj.key,
    provider: obj.provider,
    bucket: obj.bucket,
    originalName: obj.originalName,
    contentType: obj.contentType,
    sizeBytes: obj.sizeBytes,
    visibility: obj.visibility,
    namespace: obj.namespace,
    visibilityEnforced: obj.visibilityEnforced,
    tags: Array.isArray(obj.tags) ? obj.tags : [],
    ownerUserId: obj.ownerUserId,
    orgId: obj.orgId,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };

  if (Object.prototype.hasOwnProperty.call(obj, 'storageExists')) {
    response.storageExists = obj.storageExists;
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'storageCheckedBackend')) {
    response.storageCheckedBackend = obj.storageCheckedBackend;
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'storageExistsError')) {
    response.storageExistsError = obj.storageExistsError;
  }

  if (obj.visibility === 'public') {
    response.publicUrl = buildPublicUrl(obj.key);
  }

  return response;
};

const normalizeTags = (value) => {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [value];

  const tags = raw
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(tags));
};

exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    } else {
      filter.status = 'uploaded';
    }

    if (req.query.visibility) {
      filter.visibility = req.query.visibility;
    }

    if (req.query.contentType) {
      filter.contentType = { $regex: req.query.contentType, $options: 'i' };
    }

    if (req.query.ownerUserId) {
      filter.ownerUserId = req.query.ownerUserId;
    }

    if (req.query.orgId) {
      filter.orgId = req.query.orgId;
    }

    if (req.query.namespace) {
      filter.namespace = String(req.query.namespace);
    }

    if (req.query.tag) {
      const tag = String(req.query.tag).trim().toLowerCase();
      if (tag) {
        filter.tags = tag;
      }
    }

    const [assets, total] = await Promise.all([
      Asset.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Asset.countDocuments(filter)
    ]);

    const assetsWithStorage = await Promise.all(
      assets.map(async (a) => {
        const backend = a?.provider === 's3' ? 's3' : 'fs';

        try {
          const exists = await objectStorage.objectExists({ key: a.key, backend });
          return {
            ...a,
            storageCheckedBackend: backend,
            storageExists: Boolean(exists),
          };
        } catch (e) {
          return {
            ...a,
            storageCheckedBackend: backend,
            storageExists: null,
            storageExistsError: e?.message ? String(e.message) : 'storage check failed',
          };
        }
      })
    );

    res.json({
      assets: assetsWithStorage.map(formatAssetResponse),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing assets:', error);
    res.status(500).json({ error: 'Failed to list assets' });
  }
};

exports.get = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id).lean();

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ asset: formatAssetResponse(asset) });
  } catch (error) {
    console.error('Error getting asset:', error);
    res.status(500).json({ error: 'Failed to get asset' });
  }
};

exports.upload = async (req, res) => {
  try {
    if (!req.file && !req.files?.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.file || req.files.file;
    const buffer = file.buffer || (file.data ? file.data : null);

    if (!buffer) {
      return res.status(400).json({ error: 'Unable to read file buffer' });
    }

    const contentType = file.mimetype;
    const originalName = file.originalname || file.name;
    const sizeBytes = buffer.length;

    const namespaceKey = req.body?.namespace ? String(req.body.namespace).trim() : 'default';
    const namespaceConfig = await uploadNamespacesService.resolveNamespace(namespaceKey);

    const hardCapMaxFileSizeBytes = await uploadNamespacesService.getEffectiveHardCapMaxFileSizeBytes();

    const validation = uploadNamespacesService.validateUpload({
      namespaceConfig,
      contentType,
      sizeBytes,
      hardCapMaxFileSizeBytes,
    });

    if (!validation.ok) {
      return res.status(400).json({
        error: 'Upload rejected by namespace policy',
        namespace: namespaceConfig.key,
        hardCapMaxFileSizeBytes,
        errors: validation.errors,
      });
    }

    const key = uploadNamespacesService.generateObjectKey({
      namespaceConfig,
      originalName,
    });

    const visibility = uploadNamespacesService.computeVisibility({
      namespaceConfig,
      requestedVisibility: req.body?.visibility,
    });

    const { provider, bucket } = await objectStorage.putObject({
      key,
      body: buffer,
      contentType
    });

    const asset = await Asset.create({
      key,
      provider,
      bucket,
      originalName,
      contentType,
      sizeBytes,
      visibility,
      namespace: namespaceConfig.key,
      visibilityEnforced: Boolean(namespaceConfig.enforceVisibility),
      ownerUserId: null,
      orgId: null,
      status: 'uploaded'
    });

    res.status(201).json({ asset: formatAssetResponse(asset) });
  } catch (error) {
    console.error('Error uploading asset:', error);
    res.status(500).json({ error: 'Failed to upload asset' });
  }
};

exports.update = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const allowedFields = ['visibility', 'orgId', 'tags'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.tags !== undefined) {
      updates.tags = normalizeTags(updates.tags) || [];
    }

    if (updates.visibility && !['public', 'private'].includes(updates.visibility)) {
      return res.status(400).json({ error: 'Invalid visibility value' });
    }

    if (updates.visibility && asset.visibilityEnforced) {
      return res.status(400).json({ error: 'Visibility is enforced by the upload namespace for this asset' });
    }

    Object.assign(asset, updates);
    await asset.save();

    res.json({ asset: formatAssetResponse(asset) });
  } catch (error) {
    console.error('Error updating asset:', error);
    res.status(500).json({ error: 'Failed to update asset' });
  }
};

exports.delete = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    await objectStorage.deleteObject({ key: asset.key });

    asset.status = 'deleted';
    await asset.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
};

exports.getStorageInfo = async (req, res) => {
  try {
    const multerCeilingMaxFileSizeBytes = Number(process.env.MULTER_FILE_SIZE_LIMIT || '1073741824');
    const envFallbackHardCapMaxFileSizeBytes = uploadNamespacesService.getEnvHardCapMaxFileSizeBytes();
    const configuredHardCapMaxFileSizeBytes = await uploadNamespacesService.getConfiguredHardCapMaxFileSizeBytes();
    const hardCapMaxFileSizeBytes = await uploadNamespacesService.getEffectiveHardCapMaxFileSizeBytes();

    const [provider, bucket, s3Enabled] = await Promise.all([
      objectStorage.getProvider(),
      objectStorage.getBucket(),
      objectStorage.isS3Enabled(),
    ]);

    res.json({
      provider,
      bucket,
      s3Enabled,
      maxFileSize: objectStorage.getMaxFileSize(),
      multerCeilingMaxFileSizeBytes,
      envFallbackHardCapMaxFileSizeBytes,
      configuredHardCapMaxFileSizeBytes,
      hardCapMaxFileSizeBytes,
      allowedContentTypes: objectStorage.getAllowedContentTypes()
    });
  } catch (error) {
    console.error('Error getting storage info:', error);
    res.status(500).json({ error: 'Failed to get storage info' });
  }
};
