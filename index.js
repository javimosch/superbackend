require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const { basicAuth } = require("./src/middleware/auth");

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

  // Database connection
  const mongoUri =
    options.mongodbUri ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/saasbackend";
  mongoose
    .connect(mongoUri)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

  // CORS configuration
  const configureCORS = () => {
    const corsOrigin = options.corsOrigin || process.env.CORS_ORIGIN || "*";

    if (corsOrigin === "*") {
      return {
        origin: "*",
        credentials: true,
        optionsSuccessStatus: 200,
      };
    }

    if (corsOrigin.includes(",")) {
      const origins = corsOrigin.split(",").map((o) => o.trim());
      return {
        origin: origins,
        credentials: true,
        optionsSuccessStatus: 200,
      };
    }

    return {
      origin: corsOrigin,
      credentials: true,
      optionsSuccessStatus: 200,
    };
  };

  const corsOptions = configureCORS();

  console.log("🌐 CORS Configuration:", {
    origin: corsOptions.origin,
    credentials: corsOptions.credentials,
  });

  // Middleware
  app.use(cors(corsOptions));

  // Stripe webhook needs raw body (support both routes)
  const webhookHandler =
    require("./src/controllers/billing.controller").handleWebhook;
  app.post(
    "/api/stripe-webhook",
    express.raw({ type: "application/json" }),
    webhookHandler,
  );
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    webhookHandler,
  );

  // Regular JSON parsing for other routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Set EJS as templating engine
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // Serve static files
  app.use(express.static(path.join(__dirname, "public")));

  // API Routes
  app.use("/api/auth", require("./src/routes/auth.routes"));
  app.use("/api/billing", require("./src/routes/billing.routes"));
  app.use("/api/admin", require("./src/routes/admin.routes"));
  app.use("/api/admin/settings", require("./src/routes/globalSettings.routes"));
  app.use("/api/settings", require("./src/routes/globalSettings.routes"));
  app.use("/api", require("./src/routes/notifications.routes"));
  app.use("/api/user", require("./src/routes/user.routes"));

  // Admin test page (protected by basic auth)
  app.get("/admin/test", basicAuth, (req, res) => {
    res.render("admin-test");
  });

  // Admin global settings page (protected by basic auth)
  app.get("/admin/global-settings", basicAuth, (req, res) => {
    res.render("admin-global-settings");
  });

  // Health check
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      mode: "standalone",
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  });

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`🚀 SaaSBackend server running on http://localhost:${PORT}`);
    console.log("📋 API Endpoints:");
    console.log("  POST /api/auth/register - Register user");
    console.log("  POST /api/auth/login - Login user");
    console.log("  POST /api/auth/refresh-token - Refresh JWT");
    console.log("  GET  /api/auth/me - Get current user");
    console.log(
      "  POST /api/billing/create-checkout-session - Create Stripe checkout",
    );
    console.log(
      "  POST /api/billing/create-portal-session - Create billing portal",
    );
    console.log(
      "  POST /api/billing/reconcile-subscription - Reconcile subscription",
    );
    console.log("  POST /api/stripe-webhook - Stripe webhook (legacy)");
    console.log("  POST /api/stripe/webhook - Stripe webhook");
    console.log("  GET  /api/admin/users - List users (Basic Auth)");
    console.log("  GET  /api/admin/users/:id - Get user (Basic Auth)");
    console.log(
      "  PUT  /api/admin/users/:id/subscription - Update subscription (Basic Auth)",
    );
    console.log(
      "  POST /api/admin/users/:id/reconcile - Reconcile user (Basic Auth)",
    );
    console.log(
      "  POST /api/admin/generate-token - Generate JWT for testing (Basic Auth)",
    );
    console.log(
      "  GET  /api/admin/stripe-webhooks - List webhook events (Basic Auth)",
    );
    console.log(
      "  GET  /api/admin/stripe-webhooks/:id - Get webhook event (Basic Auth)",
    );
    console.log("  GET  /api/notifications - Get user notifications (JWT)");
    console.log(
      "  PUT  /api/notifications/:id/read - Mark notification as read (JWT)",
    );
    console.log("  GET  /api/activity-log - Get user activity log (JWT)");
    console.log("  POST /api/activity-log - Create activity log entry (JWT)");
    console.log("  PUT  /api/user/profile - Update user profile (JWT)");
    console.log("  PUT  /api/user/password - Change password (JWT)");
    console.log(
      "  POST /api/user/password-reset-request - Request password reset",
    );
    console.log(
      "  POST /api/user/password-reset-confirm - Confirm password reset",
    );
    console.log("  DELETE /api/user/account - Delete account (JWT)");
    console.log("  GET  /api/user/settings - Get user settings (JWT)");
    console.log("  PUT  /api/user/settings - Update user settings (JWT)");
    console.log(
      "  GET  /api/admin/settings - Get all global settings (Basic Auth)",
    );
    console.log(
      "  GET  /api/admin/settings/:key - Get specific setting (Basic Auth)",
    );
    console.log(
      "  PUT  /api/admin/settings/:key - Update setting (Basic Auth)",
    );
    console.log("  POST /api/admin/settings - Create new setting (Basic Auth)");
    console.log(
      "  DELETE /api/admin/settings/:key - Delete setting (Basic Auth)",
    );
    console.log(
      "  GET  /api/admin/settings/public - Get public settings (No Auth)",
    );
    console.log("");
    console.log("🔧 Admin Testing UI:");
    console.log("  GET  /admin/test - API Testing Interface (Basic Auth)");
    console.log(
      "  GET  /admin/global-settings - Global Settings Manager (Basic Auth)",
    );
  });

  return { app, server };
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

module.exports = {
  server: startServer,
  middleware: middleware,
  services: {
    email: require("./src/services/email.service"),
    storage: require("./src/services/storage"),
  },
  models: {
    EmailLog: require("./src/models/EmailLog"),
    GlobalSetting: require("./src/models/GlobalSetting"),
    User: require("./src/models/User"),
  },
};
