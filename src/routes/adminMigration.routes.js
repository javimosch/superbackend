const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const { auditMiddleware } = require('../services/auditLogger');

const adminMigrationController = require('../controllers/adminMigration.controller');

router.get(
  '/environments',
  adminSessionAuth,
  adminMigrationController.listEnvironments,
);

router.get(
  '/environments/:envKey',
  adminSessionAuth,
  adminMigrationController.getEnvironment,
);

router.get(
  '/models',
  adminSessionAuth,
  adminMigrationController.listModels,
);

router.get(
  '/models/:modelName/schema',
  adminSessionAuth,
  adminMigrationController.getModelSchema,
);

router.post(
  '/preview',
  adminSessionAuth,
  adminMigrationController.preview,
);

router.post(
  '/environments',
  adminSessionAuth,
  auditMiddleware('admin.migration.environments.upsert', { entityType: 'GlobalSetting' }),
  adminMigrationController.upsertEnvironment,
);

router.delete(
  '/environments/:envKey',
  adminSessionAuth,
  auditMiddleware('admin.migration.environments.delete', { entityType: 'GlobalSetting' }),
  adminMigrationController.deleteEnvironment,
);

router.post(
  '/test-connection',
  adminSessionAuth,
  auditMiddleware('admin.migration.test_connection', { entityType: 'Migration' }),
  adminMigrationController.testConnection,
);

router.post(
  '/test-assets',
  adminSessionAuth,
  auditMiddleware('admin.migration.test_assets', { entityType: 'Migration' }),
  adminMigrationController.testAssetsTarget,
);

router.post(
  '/test-assets-copy',
  adminSessionAuth,
  auditMiddleware('admin.migration.test_assets_copy', { entityType: 'Migration' }),
  adminMigrationController.testAssetsCopyKey,
);

router.post(
  '/run',
  adminSessionAuth,
  auditMiddleware('admin.migration.run', { entityType: 'Migration' }),
  adminMigrationController.runMigration,
);

module.exports = router;
