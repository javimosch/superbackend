const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const { auditMiddleware } = require('../services/auditLogger');

const adminMigrationController = require('../controllers/adminMigration.controller');

router.get(
  '/environments',
  basicAuth,
  adminMigrationController.listEnvironments,
);

router.post(
  '/environments',
  basicAuth,
  auditMiddleware('admin.migration.environments.upsert', { entityType: 'GlobalSetting' }),
  adminMigrationController.upsertEnvironment,
);

router.delete(
  '/environments/:envKey',
  basicAuth,
  auditMiddleware('admin.migration.environments.delete', { entityType: 'GlobalSetting' }),
  adminMigrationController.deleteEnvironment,
);

router.post(
  '/test-connection',
  basicAuth,
  auditMiddleware('admin.migration.test_connection', { entityType: 'Migration' }),
  adminMigrationController.testConnection,
);

router.post(
  '/run',
  basicAuth,
  auditMiddleware('admin.migration.run', { entityType: 'Migration' }),
  adminMigrationController.runMigration,
);

module.exports = router;
