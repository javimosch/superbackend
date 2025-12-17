const express = require('express');
const router = express.Router();
const multer = require('multer');
const { basicAuth } = require('../middleware/auth');
const adminAssetsController = require('../controllers/adminAssets.controller');

const adminAssetsStorageRoutes = require('./adminAssetsStorage.routes');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MULTER_FILE_SIZE_LIMIT || '1073741824', 10)
  }
});

router.get('/info', basicAuth, adminAssetsController.getStorageInfo);
router.use('/storage', basicAuth, adminAssetsStorageRoutes);
router.get('/', basicAuth, adminAssetsController.list);
router.get('/:id', basicAuth, adminAssetsController.get);
router.post('/upload', basicAuth, upload.single('file'), adminAssetsController.upload);
router.post('/:id/replace', basicAuth, upload.single('file'), adminAssetsController.replace);
router.patch('/:id', basicAuth, adminAssetsController.update);
router.delete('/:id', basicAuth, adminAssetsController.delete);

module.exports = router;
