require("dotenv").config({ path: process.env.ENV_FILE || ".env" });
const express = require("express");

/**
 * Creates the SuperBackend as Express middleware
 * @param {Object} options - Configuration options
 * @param {string} options.mongodbUri - MongoDB connection string
 * @param {string} options.corsOrigin - CORS origin(s)
 * @param {string} options.jwtSecret - JWT secret for authentication
 * @param {Object} options.dbConnection - Existing Mongoose connection
 * @returns {express.Router} Configured Express router
 */
const middleware = require("./src/middleware");
const { attachTerminalWebsocketServer } = require('./src/services/terminalsWs.service');

/**
 * Creates and starts a standalone SuperBackend server
 * @param {Object} options - Configuration options
 * @param {number} options.port - Port to listen on
 * @param {string} options.mongodbUri - MongoDB connection string
 * @param {string} options.corsOrigin - CORS origin(s)
 * @returns {Object} Express app and server instance
 */
function startServer(options = {}) {
  const app = express();
  const PORT = options.port || process.env.PORT || 3000;

  const router = module.exports.middleware(options);
  app.use(router);

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`🚀 SuperBackend standalone server running on http://localhost:${PORT}`);
  });

  // Attach WebSocket server via middleware helper or directly
  console.log('[Index] Attaching WebSocket server...');
  if (typeof router.attachWs === 'function') {
    console.log('[Index] Using router.attachWs');
    router.attachWs(server);
  } else {
    // Fallback: attach directly with admin path
    const adminPath = router.adminPath || '/admin';
    console.log('[Index] Using fallback attach with adminPath:', adminPath);
    attachTerminalWebsocketServer(server, { basePathPrefix: adminPath });
  }

  return { app, server };
}

const saasbackend = {
  server: startServer,
  consoleOverride: require("./src/services/consoleOverride.service"),
  middleware: (options = {}) => {
    // Set both registries for backward compatibility
    globalThis.superbackend = saasbackend;
    globalThis.saasbackend = saasbackend; // Legacy support
    return middleware(options);
  },
  services: {
    email: require("./src/services/email.service"),
    storage: require("./src/services/storage"),
    i18n: require("./src/services/i18n.service"),
    audit: require("./src/services/audit.service"),
    cacheLayer: require("./src/services/cacheLayer.service"),
    rbac: require("./src/services/rbac.service"),
    globalSettings: require("./src/services/globalSettings.service"),
    jsonConfigs: require("./src/services/jsonConfigs.service"),
    assets: require("./src/services/assets.service"),
    uploadNamespaces: require("./src/services/uploadNamespaces.service"),
    llm: require("./src/services/llm.service"),
    migration: require("./src/services/migration.service"),
    ejsVirtual: require("./src/services/ejsVirtual.service"),
    forms: require("./src/services/forms.service"),
    webhooks: require("./src/services/webhook.service"),
    workflow: require("./src/services/workflow.service"),
    healthChecks: require("./src/services/healthChecks.service"),
    dbBrowser: require("./src/services/dbBrowser.service"),
    rateLimiter: require("./src/services/rateLimiter.service"),
  },
  models: {
    ActionEvent: require("./src/models/ActionEvent"),
    ActivityLog: require("./src/models/ActivityLog"),
    Asset: require("./src/models/Asset"),
    AuditEvent: require("./src/models/AuditEvent"),
    CacheEntry: require("./src/models/CacheEntry"),
    RateLimitCounter: require("./src/models/RateLimitCounter"),
    RateLimitMetricBucket: require("./src/models/RateLimitMetricBucket"),
    RbacRole: require("./src/models/RbacRole"),
    RbacUserRole: require("./src/models/RbacUserRole"),
    RbacGroup: require("./src/models/RbacGroup"),
    RbacGroupMember: require("./src/models/RbacGroupMember"),
    RbacGroupRole: require("./src/models/RbacGroupRole"),
    RbacGrant: require("./src/models/RbacGrant"),
    EmailLog: require("./src/models/EmailLog"),
    ErrorAggregate: require("./src/models/ErrorAggregate"),
    FormSubmission: require("./src/models/FormSubmission"),
    GlobalSetting: require("./src/models/GlobalSetting"),
    I18nEntry: require("./src/models/I18nEntry"),
    ScriptDefinition: require("./src/models/ScriptDefinition"),
    ScriptRun: require("./src/models/ScriptRun"),
    I18nLocale: require("./src/models/I18nLocale"),
    Invite: require("./src/models/Invite"),
    JsonConfig: require("./src/models/JsonConfig"),
    Notification: require("./src/models/Notification"),
    Organization: require("./src/models/Organization"),
    OrganizationMember: require("./src/models/OrganizationMember"),
    StripeCatalogItem: require("./src/models/StripeCatalogItem"),
    StripeWebhookEvent: require("./src/models/StripeWebhookEvent"),
    User: require("./src/models/User"),
    WaitingList: require("./src/models/WaitingList"),
    VirtualEjsFile: require("./src/models/VirtualEjsFile"),
    VirtualEjsFileVersion: require("./src/models/VirtualEjsFileVersion"),
    VirtualEjsGroupChange: require("./src/models/VirtualEjsGroupChange"),
    Webhook: require("./src/models/Webhook"),
    Workflow: require("./src/models/Workflow"),
    WorkflowExecution: require("./src/models/WorkflowExecution"),

    HealthCheck: require("./src/models/HealthCheck"),
    HealthCheckRun: require("./src/models/HealthCheckRun"),
    HealthIncident: require("./src/models/HealthIncident"),
    HealthAutoHealAttempt: require("./src/models/HealthAutoHealAttempt"),

    ExternalDbConnection: require("./src/models/ExternalDbConnection"),
  },
  helpers: {
    auth: require("./src/middleware/auth"),
    org: require("./src/middleware/org"),
    rbac: require("./src/middleware/rbac"),
    i18n: require("./src/services/i18n.service"),
    jsonConfigs: require("./src/services/jsonConfigs.service"),
    terminals: require("./src/services/terminalsWs.service"),
    rateLimiter: require("./src/services/rateLimiter.service"),
  },
};

module.exports = saasbackend;
