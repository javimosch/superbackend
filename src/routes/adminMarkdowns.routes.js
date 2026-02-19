const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');

const adminMarkdownsController = require('../controllers/adminMarkdowns.controller');

router.use(adminSessionAuth);
router.post('/validate-path', adminSessionAuth, adminMarkdownsController.validatePath);

module.exports = router;
