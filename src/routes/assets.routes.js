const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const assetsController = require('../controllers/assets.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10)
  }
});

router.post('/upload', authenticate, upload.single('file'), assetsController.upload);
router.get('/', authenticate, assetsController.list);
router.get('/:id', authenticate, assetsController.get);
router.get('/:id/download', authenticate, assetsController.download);
router.delete('/:id', authenticate, assetsController.delete);

module.exports = router;
