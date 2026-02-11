const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middleware/auth');

const adminMarkdownsController = require('../controllers/adminMarkdowns.controller');

router.get('/', basicAuth, adminMarkdownsController.list);
router.get('/group-codes/:category', basicAuth, adminMarkdownsController.getGroupCodes);
router.get('/folder/:category/:group_code?', basicAuth, adminMarkdownsController.getFolderContents);
router.get('/:id', basicAuth, adminMarkdownsController.get);
router.post('/', basicAuth, adminMarkdownsController.create);
router.put('/:id', basicAuth, adminMarkdownsController.update);
router.delete('/:id', basicAuth, adminMarkdownsController.remove);
router.post('/validate-path', basicAuth, adminMarkdownsController.validatePath);

module.exports = router;
