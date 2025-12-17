const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const ejs = require("ejs");
const { basicAuth } = require("./middleware/auth");
const endpointRegistry = require("./admin/endpointRegistry");
const { createFeatureFlagsEjsMiddleware } = require("./services/featureFlags.service");

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
    const connectionOptions = options.mongooseOptions || {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    };
    
    // Return a promise that resolves when connection is established
    const connectionPromise = mongoose
      .connect(mongoUri, connectionOptions)
      .then(() => {
        console.log("✅ Middleware: Connected to MongoDB");
        return true;
      })
      .catch((err) => {
        console.error("❌ Middleware: MongoDB connection error:", err);
        return false;
      });
    
    // Store the promise so it can be awaited if needed
    router.connectionPromise = connectionPromise;
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

  // EJS locals: feature flags for server-rendered pages
  router.use(createFeatureFlagsEjsMiddleware());

  // API Routes
  router.use("/api/auth", require("./routes/auth.routes"));
  router.use("/api/billing", require("./routes/billing.routes"));
  router.use("/api/waiting-list", require("./routes/waitingList.routes"));
  router.use("/api/metrics", require("./routes/metrics.routes"));
  router.use("/api/forms", require("./routes/forms.routes"));
  router.use("/api/admin/forms", require("./routes/formsAdmin.routes"));
  router.use(
    "/api/admin/waiting-list",
    require("./routes/waitingListAdmin.routes"),
  );
  router.use("/api/admin/orgs", require("./routes/orgAdmin.routes"));
  router.use("/api/admin/users", require("./routes/userAdmin.routes"));
  router.use("/api/admin/notifications", require("./routes/notificationAdmin.routes"));
  router.use("/api/admin/stripe", require("./routes/stripeAdmin.routes"));
  router.use("/api/admin", require("./routes/admin.routes"));
  router.use("/api/admin/settings", require("./routes/globalSettings.routes"));
  router.use(
    "/api/admin/feature-flags",
    require("./routes/adminFeatureFlags.routes"),
  );
  router.use("/api/admin/i18n", require("./routes/adminI18n.routes"));
  router.use("/api/admin/assets", require("./routes/adminAssets.routes"));
  router.use("/api/settings", require("./routes/globalSettings.routes"));
  router.use("/api/feature-flags", require("./routes/featureFlags.routes"));
  router.use("/api/assets", require("./routes/assets.routes"));
  router.use("/api/i18n", require("./routes/i18n.routes"));
  router.use("/api", require("./routes/notifications.routes"));
  router.use("/api/user", require("./routes/user.routes"));
  router.use("/api/orgs", require("./routes/org.routes"));
  router.use("/api/invites", require("./routes/invite.routes"));

  // Public assets proxy
  router.use("/public/assets", require("./routes/publicAssets.routes"));

  // Admin test page (protected by basic auth) - render manually to avoid view engine conflicts
  router.get("/admin/test", basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-test.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get("/admin/i18n", basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-i18n.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get("/admin/i18n/locales", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-i18n-locales.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin forms page (protected by basic auth)
  router.get("/admin/forms", basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-forms.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin feature flags page (protected by basic auth)
  router.get("/admin/feature-flags", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-feature-flags.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin assets page (protected by basic auth)
  router.get("/admin/assets", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-assets.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin waiting list page (protected by basic auth)
  router.get("/admin/waiting-list", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-waiting-list.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, {
          baseUrl: req.baseUrl,
          endpointRegistry,
        });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin organizations page (protected by basic auth)
  router.get("/admin/organizations", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-organizations.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin users page (protected by basic auth)
  router.get("/admin/users", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-users.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin notifications page (protected by basic auth)
  router.get("/admin/notifications", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-notifications.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin Stripe pricing page (protected by basic auth)
  router.get("/admin/stripe-pricing", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-stripe-pricing.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin metrics page (protected by basic auth)
  router.get("/admin/metrics", basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-metrics.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, {
          baseUrl: req.baseUrl,
          endpointRegistry,
        });
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
