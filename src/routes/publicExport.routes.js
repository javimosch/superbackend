const express = require('express');
const router = express.Router();
const publicExportController = require('../controllers/publicExport.controller');

// Public export access page and authentication
router.get('/:name', publicExportController);
router.post('/:name/auth', publicExportController);

module.exports = router;
