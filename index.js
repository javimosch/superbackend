require("dotenv").config();
const express = require("express");

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
  },
  models: {
    EmailLog: require("./src/models/EmailLog"),
    GlobalSetting: require("./src/models/GlobalSetting"),
    JsonConfig: require("./src/models/JsonConfig"),
    User: require("./src/models/User"),
    Organization: require("./src/models/Organization"),
    OrganizationMember: require("./src/models/OrganizationMember"),
    Invite: require("./src/models/Invite"),
    I18nLocale: require("./src/models/I18nLocale"),
    I18nEntry: require("./src/models/I18nEntry"),
    AuditEvent: require("./src/models/AuditEvent"),
  },
  helpers: {
    auth: require("./src/middleware/auth"),
    org: require("./src/middleware/org"),
    i18n: require("./src/services/i18n.service"),
    jsonConfigs: require("./src/services/jsonConfigs.service"),
  },
};

module.exports = saasbackend;
