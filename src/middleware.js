const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const ejs = require("ejs");
const { basicAuth } = require("./middleware/auth");
const endpointRegistry = require("./admin/endpointRegistry");
const { createFeatureFlagsEjsMiddleware } = require("./services/featureFlags.service");
const consoleOverride = require("./services/consoleOverride.service");
const cronScheduler = require("./services/cronScheduler.service");
const {
  hookConsoleError,
  setupProcessHandlers,
  expressErrorMiddleware,
  requestIdMiddleware,
} = require("./middleware/errorCapture");

let errorCaptureInitialized = false;

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
  const adminPath = options.adminPath || "/admin";

  // Expose adminPath and WS attachment helper
  router.adminPath = adminPath;
  router.attachWs = (server) => {
    const { attachTerminalWebsocketServer } = require('./services/terminalsWs.service');
    attachTerminalWebsocketServer(server, { basePathPrefix: adminPath });
  };

  // Initialize console override service early to capture all logs
  consoleOverride.init();

  if (!errorCaptureInitialized) {
    errorCaptureInitialized = true;
    hookConsoleError();
    setupProcessHandlers();
  }

  // Database connection
  const mongoUri =
    options.mongodbUri || options.dbConnection || process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri && mongoose.connection.readyState !== 1) {
    console.warn(
      "⚠️  Warning: No MongoDB connection provided to middleware. Set MONGODB_URI or MONGO_URI in environment or pass mongodbUri/dbConnection option.",
    );
  } else if (mongoUri && mongoose.connection.readyState !== 1) {
    const connectionOptions = options.mongooseOptions || {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    };
    
    // Return a promise that resolves when connection is established
    const connectionPromise = mongoose
      .connect(mongoUri, connectionOptions)
      .then(async () => {
        console.log("✅ Middleware: Connected to MongoDB");
        // Start cron scheduler after DB connection
        await cronScheduler.start();
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
    // Start cron scheduler for existing connection
    cronScheduler.start().catch(err => {
      console.error("Failed to start cron scheduler:", err);
    });
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

  router.use(requestIdMiddleware);

  // Serve public static files (e.g. /og/og-default.png)
  router.use(express.static(path.join(__dirname, "..", "public")));

  // Serve browser SDK bundles
  router.use(
    "/public/sdk",
    express.static(path.join(__dirname, "..", "public", "sdk")),
  );

  // Serve static files for admin views
  router.use(
    `${adminPath}/assets`,
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
  
  // Stats Routes
  const adminStatsController = require("./controllers/adminStats.controller");
  router.get("/api/admin/stats/overview", basicAuth, adminStatsController.getOverviewStats);
  
  router.get(`${adminPath}/stats/dashboard-home`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-dashboard-home.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/terminals`, basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-terminals.ejs",
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
            adminPath,
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

  router.get(`${adminPath}/scripts`, basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-scripts.ejs",
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
            adminPath,
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

  router.get(`${adminPath}/crons`, basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-crons.ejs",
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
            adminPath,
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

  router.use("/api/admin", require("./routes/admin.routes"));
  router.use("/api/admin/settings", require("./routes/globalSettings.routes"));
  router.use(
    "/api/admin/feature-flags",
    require("./routes/adminFeatureFlags.routes"),
  );
  router.use(
    "/api/admin/json-configs",
    require("./routes/adminJsonConfigs.routes"),
  );
  router.use(
    "/api/admin/seo-config",
    require("./routes/adminSeoConfig.routes"),
  );
  router.use("/api/admin/i18n", require("./routes/adminI18n.routes"));
  router.use("/api/admin/headless", require("./routes/adminHeadless.routes"));
  router.use("/api/admin/scripts", require("./routes/adminScripts.routes"));
  router.use("/api/admin/crons", require("./routes/adminCrons.routes"));
  router.use("/api/admin/terminals", require("./routes/adminTerminals.routes"));
  router.use("/api/admin/assets", require("./routes/adminAssets.routes"));
  router.use(
    "/api/admin/upload-namespaces",
    require("./routes/adminUploadNamespaces.routes"),
  );
  router.use("/api/admin/ui-components", require("./routes/adminUiComponents.routes"));
  router.use("/api/admin/migration", require("./routes/adminMigration.routes"));
  router.use("/api/admin/errors", basicAuth, require("./routes/adminErrors.routes"));
  router.use("/api/admin/audit", basicAuth, require("./routes/adminAudit.routes"));
  router.use("/api/admin/llm", require("./routes/adminLlm.routes"));
  router.use("/api/admin/ejs-virtual", require("./routes/adminEjsVirtual.routes"));
  router.use("/api/workflows", basicAuth, require("./routes/workflows.routes"));
  router.use("/w", require("./routes/workflowWebhook.routes"));
  router.use("/api/webhooks", require("./routes/webhook.routes"));
  router.use("/api/settings", require("./routes/globalSettings.routes"));
  router.use("/api/feature-flags", require("./routes/featureFlags.routes"));
  router.use("/api/json-configs", require("./routes/jsonConfigs.routes"));
  router.use("/api/assets", require("./routes/assets.routes"));
  router.use("/api/i18n", require("./routes/i18n.routes"));
  router.use("/api/headless", require("./routes/headless.routes"));
  router.use("/api", require("./routes/notifications.routes"));
  router.use("/api/user", require("./routes/user.routes"));
  router.use("/api/orgs", require("./routes/org.routes"));
  router.use("/api/invites", require("./routes/invite.routes"));
  router.use("/api/log", require("./routes/log.routes"));
  router.use("/api/error-tracking", require("./routes/errorTracking.routes"));
  router.use("/api/ui-components", require("./routes/uiComponentsPublic.routes"));
  router.use("/api/llm/ui", require("./routes/llmUi.routes"));

  // Public assets proxy
  router.use("/public/assets", require("./routes/publicAssets.routes"));

  // Admin dashboard (polished view)
  router.get(adminPath, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-dashboard.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin technical API test page (protected by basic auth)
  router.get(`${adminPath}/api/test`, basicAuth, (req, res) => {
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
            adminPath,
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

  router.get(`${adminPath}/migration`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-migration.ejs");
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
            adminPath,
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

  // Admin LLM/AI page (protected by basic auth)
  router.get(`${adminPath}/admin-llm`, basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-llm.ejs",
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
            adminPath,
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

  router.get(`${adminPath}/workflows/:id`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-workflows.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/ejs-virtual`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-ejs-virtual.ejs");
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
            adminPath,
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

  router.get(`${adminPath}/seo-config`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-seo-config.ejs");
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
            adminPath,
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

  router.get(`${adminPath}/i18n`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-i18n.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/i18n/locales`, basicAuth, (req, res) => {
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
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin forms page (protected by basic auth)
  router.get(`${adminPath}/forms`, basicAuth, (req, res) => {
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
            adminPath,
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
  router.get(`${adminPath}/feature-flags`, basicAuth, (req, res) => {
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
            adminPath,
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

  // Admin headless CMS page (protected by basic auth)
  router.get(`${adminPath}/headless`, basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-headless.ejs",
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
            adminPath,
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

  // Admin UI Components page (protected by basic auth)
  router.get(`${adminPath}/ui-components`, basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-ui-components.ejs",
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
            adminPath,
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

  // Admin JSON configs page (protected by basic auth)
  router.get(`${adminPath}/json-configs`, basicAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-json-configs.ejs",
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
            adminPath,
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
  router.get(`${adminPath}/assets`, basicAuth, (req, res) => {
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
            adminPath,
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
  router.get(`${adminPath}/waiting-list`, basicAuth, (req, res) => {
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
          adminPath,
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
  router.get(`${adminPath}/organizations`, basicAuth, (req, res) => {
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
            adminPath,
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
  router.get(`${adminPath}/users`, basicAuth, (req, res) => {
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
            adminPath,
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
  router.get(`${adminPath}/notifications`, basicAuth, (req, res) => {
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
            adminPath,
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
  router.get(`${adminPath}/stripe-pricing`, basicAuth, (req, res) => {
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
            adminPath,
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
  router.get(`${adminPath}/metrics`, basicAuth, (req, res) => {
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
          adminPath,
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
  router.get(`${adminPath}/global-settings`, basicAuth, (req, res) => {
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
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/errors`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-errors.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/audit`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-audit.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/coolify-deploy`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-coolify-deploy.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/webhooks`, basicAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-webhooks.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath }, { filename: templatePath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get("/health", (req, res) => {
    res.json({
      status: "ok",
      mode: "middleware",
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  });

  router.use("/api/ejs-virtual", require("./routes/adminEjsVirtual.routes"));
  router.use("/api/webhooks", require("./routes/webhook.routes"));

  // Error handling middleware
  router.use(expressErrorMiddleware);

  return router;
}

module.exports = createMiddleware;
