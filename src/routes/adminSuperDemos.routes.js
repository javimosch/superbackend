const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const controller = require('../controllers/adminSuperDemos.controller');

router.use(express.json({ limit: '1mb' }));
router.use(adminSessionAuth);

// Projects
router.get('/projects', controller.listProjects);
router.post('/projects', controller.createProject);
router.put('/projects/:projectId', controller.updateProject);
router.post('/projects/:projectId/rotate-key', controller.rotateProjectKey);

// Demos
router.get('/projects/:projectId/demos', controller.listProjectDemos);
router.post('/projects/:projectId/demos', controller.createDemo);
router.get('/demos/:demoId', controller.getDemo);
router.put('/demos/:demoId', controller.updateDemo);
router.post('/demos/:demoId/publish', controller.publishDemo);

// Steps
router.get('/demos/:demoId/steps', controller.listSteps);
router.put('/demos/:demoId/steps', controller.replaceSteps);

// Authoring sessions
router.post('/authoring-sessions', controller.createAuthoringSession);
router.delete('/authoring-sessions/:sessionId', controller.deleteAuthoringSession);

module.exports = router;
