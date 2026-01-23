const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminCrons.controller');

router.use(basicAuth);

router.get('/', controller.listCronJobs);
router.post('/', controller.createCronJob);
router.get('/presets', controller.getCronPresets);
router.post('/preview', controller.previewNextRuns);

router.get('/:id', controller.getCronJob);
router.put('/:id', controller.updateCronJob);
router.delete('/:id', controller.deleteCronJob);

router.post('/:id/enable', controller.enableCronJob);
router.post('/:id/disable', controller.disableCronJob);
router.post('/:id/trigger', controller.triggerCronJob);

router.get('/:id/executions', controller.getExecutionHistory);
router.get('/:id/executions/:eid', controller.getExecution);

module.exports = router;
