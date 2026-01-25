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

const globalSettingsService = require('../services/globalSettings.service');

const DEFAULT_MAX_UPLOAD_BYTES = 1073741824;

const dynamicUploadSingle = (fieldName) => async (req, res, next) => {
  try {
    const raw = await globalSettingsService.getSettingValue(
      'FILE_MANAGER_MAX_UPLOAD_BYTES',
      String(DEFAULT_MAX_UPLOAD_BYTES)
    );

    const maxBytes = parseInt(String(raw || DEFAULT_MAX_UPLOAD_BYTES), 10);
    const fileSize = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_UPLOAD_BYTES;

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
