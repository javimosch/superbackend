const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const ejs = require("ejs");
const { basicAuth } = require("./middleware/auth");

/**
 * Creates and configures the SaaS backend middleware
 * @param {Object} options - Configuration options
 * @param {string} options.mongodbUri - MongoDB connection string
 * @param {string} options.corsOrigin - CORS origin(s)
 * @param {string} options.jwtSecret - JWT secret for authentication
 * @param {Object} options.dbConnection - Existing Mongoose connection
 * @param {boolean} options.skipBodyParser - Skip adding body parser middleware (default: false)
 * @returns {express.Router} Configured Express router
 */
function createMiddleware(options = {}) {
  const router = express.Router();

  // Database connection
  const mongoUri =
    options.mongodbUri || options.dbConnection || process.env.MONGODB_URI;

  if (!mongoUri && mongoose.connection.readyState !== 1) {
    console.warn(
      "⚠️  Warning: No MongoDB connection provided to middleware. Set MONGODB_URI in environment or pass mongodbUri/dbConnection option.",
    );
  } else if (mongoUri && mongoose.connection.readyState !== 1) {
    mongoose
      .connect(mongoUri)
      .then(() => console.log("✅ Middleware: Connected to MongoDB"))
      .catch((err) =>
        console.error("❌ Middleware: MongoDB connection error:", err),
      );
  } else if (mongoose.connection.readyState === 1) {
    console.log("✅ Middleware: Using existing MongoDB connection");
  }

  // CORS configuration
  const configureCORS = () => {
    const corsOrigin = options.corsOrigin || process.env.CORS_ORIGIN || "*";

    // If corsOrigin is *, allow all origins
    if (corsOrigin === "*") {
      return {
        origin: "*",
        credentials: true,
        optionsSuccessStatus: 200,
      };
    }

    // If corsOrigin contains comma, split into array
    if (corsOrigin.includes(",")) {
      const origins = corsOrigin.split(",").map((o) => o.trim());
      return {
        origin: origins,
        credentials: true,
        optionsSuccessStatus: 200,
      };
    }

    // Single origin
    return {
      origin: corsOrigin,
      credentials: true,
      optionsSuccessStatus: 200,
    };
  };

  const isCorsDisabled = options.corsOrigin === false || options.cors === false;

  if (!isCorsDisabled) {
    const corsOptions = configureCORS();

    console.log("🌐 Middleware CORS Configuration:", {
      origin: corsOptions.origin,
      credentials: corsOptions.credentials,
    });

    // Middleware
    router.use(cors(corsOptions));
  }

  // Stripe webhook needs raw body (support both routes)
  const webhookHandler =
    require("./controllers/billing.controller").handleWebhook;
  router.post(
    "/api/stripe-webhook",
    express.raw({ type: "application/json" }),
    webhookHandler,
  );
  router.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    webhookHandler,
  );

  // Regular JSON parsing for other routes (skip if parent app already handles it)
  if (!options.skipBodyParser) {
    router.use(express.json());
    router.use(express.urlencoded({ extended: true }));
  }

  // Serve static files for admin views
  router.use(
    "/admin/assets",
    express.static(path.join(__dirname, "..", "public")),
  );

  // API Routes
  router.use("/api/auth", require("./routes/auth.routes"));
  router.use("/api/billing", require("./routes/billing.routes"));
  router.use("/api/admin", require("./routes/admin.routes"));
  router.use("/api/admin/settings", require("./routes/globalSettings.routes"));
  router.use("/api/settings", require("./routes/globalSettings.routes"));
  router.use("/api", require("./routes/notifications.routes"));
  router.use("/api/user", require("./routes/user.routes"));

  // Admin test page (protected by basic auth) - render manually to avoid view engine conflicts
  router.get("/admin/test", basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-test.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin global settings page (protected by basic auth) - render manually
  router.get("/admin/global-settings", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-global-settings.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Health check
  router.get("/health", (req, res) => {
    res.json({
      status: "ok",
      mode: "middleware",
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  });

  // Error handling middleware
  router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  });

  return router;
}

module.exports = createMiddleware;
