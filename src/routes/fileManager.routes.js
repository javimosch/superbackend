const express = require('express');
const router = express.Router();
const multerModule = require('multer');
// `multer` is normally a callable function. In some test environments it can be mocked as a plain object.
const multerFactory = typeof multerModule === 'function' ? multerModule : () => multerModule;
const memoryStorage =
  typeof multerModule?.memoryStorage === 'function'
    ? multerModule.memoryStorage
    : () => ({});

const { authenticate } = require('../middleware/auth');
const { requireRight } = require('../middleware/rbac');
const controller = require('../controllers/fileManager.controller');

const fileManagerStoragePolicyService = require('../services/fileManagerStoragePolicy.service');
const storagePolicyRoutes = require('./fileManagerStoragePolicy.routes');

const dynamicUploadSingle = (fieldName) => async (req, res, next) => {
  try {
    const orgId = req.query.orgId || req.body?.orgId || req.headers['x-org-id'] || null;
    const driveType = req.query.driveType || req.body?.driveType;
    const driveId = req.query.driveId || req.body?.driveId;

    const { maxUploadBytes } = await fileManagerStoragePolicyService.resolveEffectiveLimits({
      userId: req.user._id,
      orgId,
      driveType,
      driveId,
    });

    const fileSize = Number.isFinite(maxUploadBytes) && maxUploadBytes > 0 ? maxUploadBytes : 1073741824;

    const upload = multerFactory({
      storage: memoryStorage(),
      limits: { fileSize },
    }).single(fieldName);

    upload(req, res, next);
  } catch (error) {
    next(error);
  }
};

router.use(authenticate);

router.use(storagePolicyRoutes);

router.get('/drives', requireRight('file_manager:drives:read'), controller.listDrives);
router.get('/folders', requireRight('file_manager:files:read'), controller.listFolder);

router.post(
  '/files/upload',
  requireRight('file_manager:files:upload'),
  dynamicUploadSingle('file'),
  controller.upload
);
router.get('/files/:id/download', requireRight('file_manager:files:download'), controller.download);
router.patch('/files/:id', requireRight('file_manager:files:update'), controller.update);
router.delete('/files/:id', requireRight('file_manager:files:delete'), controller.delete);
router.post('/files/:id/share', requireRight('file_manager:files:share'), controller.setShare);

module.exports = router;
