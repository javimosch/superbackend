require("dotenv").config({ path: process.env.ENV_FILE || ".env" });
const express = require("express");

// Initialize database adapter BEFORE loading middleware/services
const { initMongooseAdapter, shouldUseSQLite } = require("./src/db/mongoose-adapter");
let dbInitPromise = null;

if (shouldUseSQLite()) {
  dbInitPromise = initMongooseAdapter(true, {
    dataDir: process.env.DATA_DIR || './data',
    dbPath: process.env.DB_PATH
  });
} else {
  // MongoDB will be initialized in middleware
  dbInitPromise = Promise.resolve();
}

/**
 * Creates the SaaS backend as Express middleware
 * @param {Object} options - Configuration options
 * @param {string} options.mongodbUri - MongoDB connection string
 * @param {string} options.corsOrigin - CORS origin(s)
 * @param {string} options.jwtSecret - JWT secret for authentication
 * @param {Object} options.dbConnection - Existing Mongoose connection
 * @returns {express.Router} Configured Express router
 */
const middleware = require("./src/middleware");

/**
 * Creates and starts a standalone SaaS backend server
 * @param {Object} options - Configuration options
 * @param {number} options.port - Port to listen on
 * @param {string} options.mongodbUri - MongoDB connection string
 * @param {string} options.corsOrigin - CORS origin(s)
 * @returns {Object} Express app and server instance
 */
function startServer(options = {}) {
  const app = express();
  const PORT = options.port || process.env.PORT || 3000;

  app.use(module.exports.middleware(options));

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`🚀 SaaSBackend standalone server running on http://localhost:${PORT}`);
  });

  return { app, server };
}

const saasbackend = {
  server: startServer,
  middleware: (options = {}) => {
    globalThis.saasbackend = saasbackend;
    return middleware(options);
  },
  services: {
    email: require("./src/services/email.service"),
    storage: require("./src/services/storage"),
    i18n: require("./src/services/i18n.service"),
    audit: require("./src/services/audit.service"),
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
  },
  models: new Proxy({}, {
    get(target, prop) {
      if (!target[prop]) {
        const modelFiles = {
          ActionEvent: "./src/models/ActionEvent",
          ActivityLog: "./src/models/ActivityLog",
          Asset: "./src/models/Asset",
          AuditEvent: "./src/models/AuditEvent",
          EmailLog: "./src/models/EmailLog",
          ErrorAggregate: "./src/models/ErrorAggregate",
          FormSubmission: "./src/models/FormSubmission",
          GlobalSetting: "./src/models/GlobalSetting",
          I18nEntry: "./src/models/I18nEntry",
          I18nLocale: "./src/models/I18nLocale",
          Invite: "./src/models/Invite",
          JsonConfig: "./src/models/JsonConfig",
          Notification: "./src/models/Notification",
          Organization: "./src/models/Organization",
          OrganizationMember: "./src/models/OrganizationMember",
          StripeCatalogItem: "./src/models/StripeCatalogItem",
          StripeWebhookEvent: "./src/models/StripeWebhookEvent",
          User: "./src/models/User",
          WaitingList: "./src/models/WaitingList",
          VirtualEjsFile: "./src/models/VirtualEjsFile",
          VirtualEjsFileVersion: "./src/models/VirtualEjsFileVersion",
          VirtualEjsGroupChange: "./src/models/VirtualEjsGroupChange",
          Webhook: "./src/models/Webhook",
          Workflow: "./src/models/Workflow",
          WorkflowExecution: "./src/models/WorkflowExecution",
        };
        if (modelFiles[prop]) {
          target[prop] = require(modelFiles[prop]);
        }
      }
      return target[prop];
    }
  }),
  helpers: {
    auth: require("./src/middleware/auth"),
    org: require("./src/middleware/org"),
    i18n: require("./src/services/i18n.service"),
    jsonConfigs: require("./src/services/jsonConfigs.service"),
  },
};

module.exports = saasbackend;
