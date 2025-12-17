const Asset = require('../models/Asset');
const objectStorage = require('../services/objectStorage.service');

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
    ownerUserId: obj.ownerUserId,
    orgId: obj.orgId,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };

  if (obj.visibility === 'public') {
    response.publicUrl = buildPublicUrl(obj.key);
  }

  return response;
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

    if (!objectStorage.validateContentType(contentType)) {
      return res.status(400).json({
        error: 'Invalid file type',
        allowed: objectStorage.getAllowedContentTypes()
      });
    }

    if (!objectStorage.validateFileSize(sizeBytes)) {
      return res.status(400).json({
        error: 'File too large',
        maxSize: objectStorage.getMaxFileSize()
      });
    }

    const key = objectStorage.generateKey(originalName);
    const visibility = req.body.visibility === 'public' ? 'public' : 'private';

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

    const allowedFields = ['visibility', 'orgId'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.visibility && !['public', 'private'].includes(updates.visibility)) {
      return res.status(400).json({ error: 'Invalid visibility value' });
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
    res.json({
      provider: objectStorage.getProvider(),
      bucket: objectStorage.getBucket(),
      s3Enabled: objectStorage.isS3Enabled(),
      maxFileSize: objectStorage.getMaxFileSize(),
      allowedContentTypes: objectStorage.getAllowedContentTypes()
    });
  } catch (error) {
    console.error('Error getting storage info:', error);
    res.status(500).json({ error: 'Failed to get storage info' });
  }
};
