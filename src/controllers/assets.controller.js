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
    originalName: obj.originalName,
    contentType: obj.contentType,
    sizeBytes: obj.sizeBytes,
    visibility: obj.visibility,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };

  if (obj.visibility === 'public') {
    response.publicUrl = buildPublicUrl(obj.key);
  }

  return response;
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

    const orgId = req.body.orgId || null;

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
      ownerUserId: req.user._id,
      orgId,
      status: 'uploaded'
    });

    res.status(201).json({ asset: formatAssetResponse(asset) });
  } catch (error) {
    console.error('Error uploading asset:', error);
    res.status(500).json({ error: 'Failed to upload asset' });
  }
};

exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      ownerUserId: req.user._id,
      status: 'uploaded'
    };

    if (req.query.visibility) {
      filter.visibility = req.query.visibility;
    }

    if (req.query.orgId) {
      filter.orgId = req.query.orgId;
    }

    const [assets, total] = await Promise.all([
      Asset.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Asset.countDocuments(filter)
    ]);

    res.json({
      assets: assets.map(formatAssetResponse),
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
    const asset = await Asset.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
      status: 'uploaded'
    }).lean();

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ asset: formatAssetResponse(asset) });
  } catch (error) {
    console.error('Error getting asset:', error);
    res.status(500).json({ error: 'Failed to get asset' });
  }
};

exports.download = async (req, res) => {
  try {
    const asset = await Asset.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
      status: 'uploaded'
    }).lean();

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const result = await objectStorage.getObject({ key: asset.key });

    if (!result) {
      return res.status(404).json({ error: 'File not found in storage' });
    }

    res.set('Content-Type', asset.contentType);
    res.set('Content-Disposition', `attachment; filename="${asset.originalName}"`);
    res.send(result.body);
  } catch (error) {
    console.error('Error downloading asset:', error);
    res.status(500).json({ error: 'Failed to download asset' });
  }
};

exports.delete = async (req, res) => {
  try {
    const asset = await Asset.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
      status: 'uploaded'
    });

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

exports.getPublicAsset = async (req, res) => {
  try {
    const key = req.params[0] || req.params.key;

    if (!key) {
      return res.status(400).json({ error: 'Asset key required' });
    }

    const asset = await Asset.findOne({
      key,
      visibility: 'public',
      status: 'uploaded'
    }).lean();

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const result = await objectStorage.getObject({ key: asset.key });

    if (!result) {
      return res.status(404).json({ error: 'File not found in storage' });
    }

    res.set('Content-Type', asset.contentType);
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(result.body);
  } catch (error) {
    console.error('Error serving public asset:', error);
    res.status(500).json({ error: 'Failed to serve asset' });
  }
};
