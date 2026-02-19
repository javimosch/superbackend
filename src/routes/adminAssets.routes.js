const express = require('express');
const router = express.Router();
const multer = require('multer');
const { adminSessionAuth } = require('../middleware/auth');
const adminAssetsController = require('../controllers/adminAssets.controller');
const { auditMiddleware } = require('../services/auditLogger');

const adminAssetsStorageRoutes = require('./adminAssetsStorage.routes');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MULTER_FILE_SIZE_LIMIT || '1073741824', 10)
  }
});

router.get('/info', adminSessionAuth, adminAssetsController.getStorageInfo);
router.use('/storage', adminSessionAuth, adminAssetsStorageRoutes);
router.get('/', adminSessionAuth, adminAssetsController.list);
router.get('/:id', adminSessionAuth, adminAssetsController.get);
router.post('/bulk/move-namespace', adminSessionAuth, auditMiddleware('admin.assets.bulk.moveNamespace', { entityType: 'Asset' }), adminAssetsController.bulkMoveNamespace);
router.post('/bulk/set-tags', adminSessionAuth, auditMiddleware('admin.assets.bulk.setTags', { entityType: 'Asset' }), adminAssetsController.bulkSetTags);
router.post('/upload', adminSessionAuth, upload.single('file'), adminAssetsController.upload);
router.post('/:id/replace', adminSessionAuth, upload.single('file'), adminAssetsController.replace);
router.patch('/:id', adminSessionAuth, adminAssetsController.update);
router.delete('/:id', adminSessionAuth, adminAssetsController.delete);

module.exports = router;
