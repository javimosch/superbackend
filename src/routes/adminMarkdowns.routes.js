const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');

const adminMarkdownsController = require('../controllers/adminMarkdowns.controller');

router.use(adminSessionAuth);
router.get('/', adminMarkdownsController.list);
router.get('/group-codes/:category', adminMarkdownsController.getGroupCodes);
router.get('/folder/:category/:group_code', adminMarkdownsController.getFolderContents);
router.post('/validate-path', adminSessionAuth, adminMarkdownsController.validatePath);

module.exports = router;
