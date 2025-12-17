const express = require('express');

const router = express.Router();

const adminAssetsStorageController = require('../controllers/adminAssetsStorage.controller');

router.get('/', adminAssetsStorageController.getStorageStatus);
router.put('/s3-config', adminAssetsStorageController.saveS3Config);
router.post('/s3-check', adminAssetsStorageController.checkS3Connection);
router.post('/sync', adminAssetsStorageController.sync);
router.post('/switch', adminAssetsStorageController.switchBackend);

module.exports = router;
