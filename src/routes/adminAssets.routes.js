const express = require('express');
const router = express.Router();
const multer = require('multer');
const { basicAuth } = require('../middleware/auth');
const adminAssetsController = require('../controllers/adminAssets.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_HARD_CAP || process.env.MAX_FILE_SIZE || '10485760', 10)
  }
});

router.get('/info', basicAuth, adminAssetsController.getStorageInfo);
router.get('/', basicAuth, adminAssetsController.list);
router.get('/:id', basicAuth, adminAssetsController.get);
router.post('/upload', basicAuth, upload.single('file'), adminAssetsController.upload);
router.patch('/:id', basicAuth, adminAssetsController.update);
router.delete('/:id', basicAuth, adminAssetsController.delete);

module.exports = router;
