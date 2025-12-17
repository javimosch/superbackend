const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middleware/auth');
const adminUploadNamespacesController = require('../controllers/adminUploadNamespaces.controller');

router.get('/', basicAuth, adminUploadNamespacesController.listNamespaces);
router.get('/summary', basicAuth, adminUploadNamespacesController.getNamespacesSummary);
router.get('/:key', basicAuth, adminUploadNamespacesController.getNamespace);
router.post('/', basicAuth, adminUploadNamespacesController.createNamespace);
router.put('/:key', basicAuth, adminUploadNamespacesController.updateNamespace);
router.delete('/:key', basicAuth, adminUploadNamespacesController.deleteNamespace);

module.exports = router;
