const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const controller = require('../controllers/adminScripts.controller');

router.use(adminSessionAuth);

router.get('/', controller.listScripts);
router.post('/', controller.createScript);
router.get('/runs', controller.listRuns);
router.get('/runs/:runId', controller.getRun);
router.get('/runs/:runId/stream', controller.streamRunLogs);
router.get('/runs/:runId/programmatic-output', controller.getProgrammaticOutput);
router.get('/runs/:runId/full-output', controller.getFullOutput);
router.get('/runs/:runId/download', controller.downloadOutput);

router.get('/:id', controller.getScript);
router.put('/:id', controller.updateScript);
router.delete('/:id', controller.deleteScript);

router.post('/:id/run', controller.runScript);

module.exports = router;
