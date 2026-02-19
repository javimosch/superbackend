const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const { auditMiddleware } = require('../services/auditLogger');
const controller = require('../controllers/adminDbBrowser.controller');

router.use(adminSessionAuth);

// Connection profiles
router.get('/connections', controller.listConnections);
router.get('/connections/:id', controller.getConnection);

router.post(
  '/connections',
  auditMiddleware('admin.db_browser.connections.create', { entityType: 'ExternalDbConnection' }),
  controller.createConnection,
);

router.patch(
  '/connections/:id',
  auditMiddleware('admin.db_browser.connections.update', { entityType: 'ExternalDbConnection' }),
  controller.updateConnection,
);

router.delete(
  '/connections/:id',
  auditMiddleware('admin.db_browser.connections.delete', { entityType: 'ExternalDbConnection' }),
  controller.deleteConnection,
);

router.post(
  '/connections/:id/test',
  auditMiddleware('admin.db_browser.connections.test', { entityType: 'ExternalDbConnection' }),
  controller.testConnection,
);

// Browsing
router.get(
  '/connections/:id/databases',
  auditMiddleware('admin.db_browser.browse.databases', { entityType: 'ExternalDbConnection' }),
  controller.listDatabases,
);
router.get(
  '/connections/:id/databases/:database/namespaces',
  auditMiddleware('admin.db_browser.browse.namespaces', { entityType: 'ExternalDbConnection' }),
  controller.listNamespaces,
);
router.get(
  '/connections/:id/databases/:database/namespaces/:namespace/schema',
  auditMiddleware('admin.db_browser.browse.schema', { entityType: 'ExternalDbConnection' }),
  controller.getSchema,
);
router.get(
  '/connections/:id/databases/:database/namespaces/:namespace/records',
  auditMiddleware('admin.db_browser.browse.records', { entityType: 'ExternalDbConnection' }),
  controller.listRecords,
);
router.get(
  '/connections/:id/databases/:database/namespaces/:namespace/records/:recordId',
  auditMiddleware('admin.db_browser.browse.record', { entityType: 'ExternalDbConnection' }),
  controller.getRecord,
);

module.exports = router;
