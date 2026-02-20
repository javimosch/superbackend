const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const { auditMiddleware } = require('../services/auditLogger');
const controller = require('../controllers/adminDataCleanup.controller');

router.use(adminSessionAuth);

router.get('/overview', controller.getOverview);

router.post(
  '/dry-run',
  auditMiddleware('admin.data_cleanup.dry_run', { entityType: 'DataCleanup' }),
  controller.dryRun,
);

router.post(
  '/execute',
  auditMiddleware('admin.data_cleanup.execute', { entityType: 'DataCleanup' }),
  controller.execute,
);

router.get('/infer-fields', controller.inferFields);

module.exports = router;
