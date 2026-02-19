const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const adminUiComponentsController = require('../controllers/adminUiComponents.controller');
const adminUiComponentsAiController = require('../controllers/adminUiComponentsAi.controller');
const rateLimiter = require('../services/rateLimiter.service');

router.use(adminSessionAuth);

router.get('/projects', adminUiComponentsController.listProjects);
router.post('/projects', adminUiComponentsController.createProject);
router.get('/projects/:projectId', adminUiComponentsController.getProject);
router.put('/projects/:projectId', adminUiComponentsController.updateProject);
router.delete('/projects/:projectId', adminUiComponentsController.deleteProject);
router.post('/projects/:projectId/rotate-key', adminUiComponentsController.rotateProjectKey);

router.get('/components', adminUiComponentsController.listComponents);
router.post('/components', adminUiComponentsController.createComponent);
router.get('/components/:code', adminUiComponentsController.getComponent);
router.put('/components/:code', adminUiComponentsController.updateComponent);
router.delete('/components/:code', adminUiComponentsController.deleteComponent);

router.get('/projects/:projectId/components', adminUiComponentsController.listProjectAssignments);
router.post('/projects/:projectId/components/:code', adminUiComponentsController.setAssignment);
router.delete('/projects/:projectId/components/:code', adminUiComponentsController.deleteAssignment);

router.post('/ai/components/:code/propose', rateLimiter.limit('aiOperationsLimiter'), adminUiComponentsAiController.propose);

module.exports = router;
