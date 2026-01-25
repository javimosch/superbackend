const fileManagerService = require('../services/fileManager.service');

exports.listDrives = async (req, res) => {
  try {
    const orgId = req.query.orgId || req.headers['x-org-id'] || null;
    const payload = await fileManagerService.listDrives({ userId: req.user._id, orgId });
    return res.json(payload);
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: error.message });
    console.error('Error listing file manager drives:', error);
    return res.status(500).json({ error: 'Failed to list drives' });
  }
};

exports.listFolder = async (req, res) => {
  try {
    const orgId = req.query.orgId || req.body?.orgId || req.headers['x-org-id'] || null;
    const driveType = req.query.driveType || req.body?.driveType;
    const driveId = req.query.driveId || req.body?.driveId;
    const folderPath = req.query.folderPath || req.query.path || req.body?.folderPath || '/';
    const payload = await fileManagerService.listFolder({
      orgId,
      driveType,
      driveId,
      parentPath: folderPath || '/',
    });
    return res.json(payload);
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: error.message });
    console.error('Error listing file manager folder:', error);
    return res.status(500).json({ error: 'Failed to list folder' });
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
    const name = req.body?.name || file.originalname || file.name;

    const overwriteRaw = req.body?.overwrite ?? req.query?.overwrite;
    const overwrite = overwriteRaw === 'true' || overwriteRaw === true || overwriteRaw === '1';

    const orgId = req.body?.orgId ?? req.query?.orgId;
    const driveType = req.body?.driveType ?? req.query?.driveType;
    const driveId = req.body?.driveId ?? req.query?.driveId;
    const folderPath = req.body?.folderPath ?? req.query?.folderPath;

    const payload = await fileManagerService.uploadFile({
      userId: req.user._id,
      orgId,
      driveType,
      driveId,
      parentPath: folderPath || '/',
      name,
      buffer,
      contentType,
      overwrite,
      requestedVisibility: req.body?.visibility,
    });

    return res.status(201).json(payload);
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: error.message });
    if (code === 'CONFLICT') return res.status(409).json({ error: error.message, ...error.details });
    if (code === 'UPLOAD_REJECTED') return res.status(400).json({ error: error.message, ...error.details });

    console.error('Error uploading file manager file:', error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
};

exports.download = async (req, res) => {
  try {
    const orgId = req.query.orgId || req.headers['x-org-id'] || null;
    const driveType = req.query.driveType;
    const driveId = req.query.driveId;

    const result = await fileManagerService.downloadFile({
      orgId,
      driveType,
      driveId,
      fileId: req.params.id,
    });

    res.set('Content-Type', result.contentType);
    if (result.asset?.originalName) {
      res.set('Content-Disposition', `inline; filename="${result.asset.originalName}"`);
    }
    res.send(result.body);
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: error.message });
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'Not found' });

    console.error('Error downloading file manager file:', error);
    return res.status(500).json({ error: 'Failed to download file' });
  }
};

exports.delete = async (req, res) => {
  try {
    const orgId = req.query.orgId || req.body?.orgId || req.headers['x-org-id'] || null;
    const driveType = req.query.driveType || req.body?.driveType;
    const driveId = req.query.driveId || req.body?.driveId;

    const payload = await fileManagerService.deleteFile({
      orgId,
      driveType,
      driveId,
      fileId: req.params.id,
    });

    return res.json(payload);
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: error.message });
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'Not found' });

    console.error('Error deleting file manager file:', error);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
};

exports.update = async (req, res) => {
  try {
    const orgId = req.body?.orgId || req.query.orgId || req.headers['x-org-id'] || null;
    const driveType = req.body?.driveType || req.query.driveType;
    const driveId = req.body?.driveId || req.query.driveId;

    const payload = await fileManagerService.updateFile({
      orgId,
      driveType,
      driveId,
      fileId: req.params.id,
      name: req.body?.name,
      parentPath: req.body?.folderPath,
    });

    return res.json(payload);
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: error.message });
    if (code === 'CONFLICT') return res.status(409).json({ error: error.message, ...error.details });
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'Not found' });

    console.error('Error updating file manager file:', error);
    return res.status(500).json({ error: 'Failed to update file' });
  }
};

exports.setShare = async (req, res) => {
  try {
    const orgId = req.body?.orgId || req.query.orgId || req.headers['x-org-id'] || null;
    const driveType = req.body?.driveType || req.query.driveType;
    const driveId = req.body?.driveId || req.query.driveId;
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true' || req.body?.enabled === '1';

    const payload = await fileManagerService.setShare({
      orgId,
      driveType,
      driveId,
      fileId: req.params.id,
      enabled,
    });

    return res.json(payload);
  } catch (error) {
    const code = error?.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: error.message });
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'Not found' });
    if (code === 'VISIBILITY_ENFORCED') return res.status(400).json({ error: error.message });

    console.error('Error toggling file manager share:', error);
    return res.status(500).json({ error: 'Failed to update share status' });
  }
};
