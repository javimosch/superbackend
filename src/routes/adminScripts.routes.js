const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminScripts.controller');

router.use(basicAuth);

router.get('/', controller.listScripts);
router.post('/', controller.createScript);
router.get('/runs', controller.listRuns);
router.get('/runs/:runId', controller.getRun);
router.get('/runs/:runId/stream', controller.streamRun);

router.get('/:id', controller.getScript);
router.put('/:id', controller.updateScript);
router.delete('/:id', controller.deleteScript);

router.post('/:id/run', controller.runScript);

module.exports = router;
