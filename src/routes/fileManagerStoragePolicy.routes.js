const express = require('express');
const router = express.Router();

const { requireRight } = require('../middleware/rbac');
const controller = require('../controllers/fileManagerStoragePolicy.controller');

router.get('/storage-policy', requireRight('file_manager:access'), controller.getStoragePolicy);

module.exports = router;
