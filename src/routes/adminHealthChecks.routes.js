const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminHealthChecks.controller');

router.use(basicAuth);

router.get('/config', controller.getConfig);
router.put('/config', controller.updateConfig);

router.get('/', controller.listHealthChecks);
router.post('/', controller.createHealthCheck);

router.get('/:id', controller.getHealthCheck);
router.put('/:id', controller.updateHealthCheck);
router.delete('/:id', controller.deleteHealthCheck);

router.post('/:id/enable', controller.enableHealthCheck);
router.post('/:id/disable', controller.disableHealthCheck);
router.post('/:id/trigger', controller.triggerHealthCheck);

router.get('/:id/runs', controller.getRunHistory);
router.get('/:id/incidents', controller.getIncidents);
router.post('/:id/incidents/:incidentId/acknowledge', controller.acknowledgeIncident);
router.post('/:id/incidents/:incidentId/resolve', controller.resolveIncident);

module.exports = router;
