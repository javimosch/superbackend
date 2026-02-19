const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const adminUploadNamespacesController = require('../controllers/adminUploadNamespaces.controller');

router.get('/', adminSessionAuth, adminUploadNamespacesController.listNamespaces);
router.get('/summary', adminSessionAuth, adminUploadNamespacesController.getNamespacesSummary);
router.get('/:key', adminSessionAuth, adminUploadNamespacesController.getNamespace);
router.post('/', adminSessionAuth, adminUploadNamespacesController.createNamespace);
router.put('/:key', adminSessionAuth, adminUploadNamespacesController.updateNamespace);
router.delete('/:key', adminSessionAuth, adminUploadNamespacesController.deleteNamespace);

module.exports = router;
