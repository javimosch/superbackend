const express = require('express');
const router = express.Router();

const uiComponentsPublicController = require('../controllers/uiComponentsPublic.controller');

router.get('/projects/:projectId/manifest', uiComponentsPublicController.getManifest);
router.get('/projects/:projectId/components/:code', uiComponentsPublicController.getComponent);

module.exports = router;
