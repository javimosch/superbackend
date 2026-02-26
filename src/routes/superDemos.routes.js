const express = require('express');
const router = express.Router();

const controller = require('../controllers/superDemosPublic.controller');

router.get('/projects/:projectId/demos/published', controller.listPublishedDemos);
router.get('/demos/:demoId/definition', controller.getPublishedDemoDefinition);

module.exports = router;
