const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const assetsController = require('../controllers/assets.controller');
const { auditMiddleware } = require('../services/auditLogger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MULTER_FILE_SIZE_LIMIT || '1073741824', 10)
  }
});

router.post('/upload', authenticate, auditMiddleware('user.asset.upload', { entityType: 'Asset' }), upload.single('file'), assetsController.upload);
router.get('/', authenticate, assetsController.list);
router.get('/:id', authenticate, assetsController.get);
router.get('/:id/download', authenticate, assetsController.download);
router.delete('/:id', authenticate, auditMiddleware('user.asset.delete', { entityType: 'Asset', getEntityId: (req) => req.params.id }), assetsController.delete);

module.exports = router;
